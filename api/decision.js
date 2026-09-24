import admin from 'firebase-admin';

function initAdmin() {
  if (!admin.apps.length) {
    const svc = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')
    );
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  }
  return admin;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { idToken, submissionId, decision } = req.body || {};
    if (!idToken || !submissionId || !['accepted', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const fbadmin = initAdmin();
    const decoded = await fbadmin.auth().verifyIdToken(idToken);
    const db = fbadmin.firestore();

    const adminDoc = await db.collection('admins').doc(decoded.uid).get();
    if (!adminDoc.exists) return res.status(403).json({ error: 'Forbidden' });

    const subRef = db.collection('submissions').doc(submissionId);
    const subSnap = await subRef.get();
    if (!subSnap.exists) return res.status(404).json({ error: 'Submission not found' });
    const sub = subSnap.data();

    const recSnap = await db.collection('recruitments').doc(sub.recruitmentId).get();
    const title = recSnap.exists ? recSnap.data().title : '';

    await subRef.update({
      status: decision,
      decisionAt: fbadmin.firestore.FieldValue.serverTimestamp(),
      decisionBy: decoded.uid
    });

    if (sub.email) {
      const templateId = decision === 'accepted' ? 6 : 7;
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          to: [{ email: sub.email }],
          templateId,
          params: { ZGLOSZENIE_ID: submissionId, TYTUL: title }
        })
      });
      if (!brevoRes.ok) {
        console.error('Brevo error:', await brevoRes.text());
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
