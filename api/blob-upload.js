import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  try {
    const jsonResponse = await handleUpload({
      body: request.body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true
        };
      },
      onUploadCompleted: async () => {}
    });
    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error(error);
    return response.status(400).json({ error: error.message });
  }
}
