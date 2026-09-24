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
    const { submissionId, recruitmentId, email, title } = req.body || {};
    if (!submissionId || !recruitmentId) {
      return res.status(400).json({ error: 'Missing submissionId or recruitmentId' });
    }

    const fbadmin = initAdmin();
    const db = fbadmin.firestore();

    const subSnap = await db.collection('submissions').doc(submissionId).get();
    if (!subSnap.exists || subSnap.data().recruitmentId !== recruitmentId) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (!email) {
      return res.status(200).json({ skipped: true });
    }

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        to: [{ email }],
        templateId: 5,
        params: { ZGLOSZENIE_ID: submissionId, TYTUL: title || '' }
      })
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      console.error('Brevo error:', errText);
      return res.status(502).json({ error: 'Email send failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
