import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Path to the login images directory
    const imagesDir = path.join(process.cwd(), 'public', 'assets', 'login');
    
    // Read all files in the directory
    const files = fs.readdirSync(imagesDir);
    
    // Filter for image files (jpg, jpeg, png, webp, etc.)
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });
    
    // Map to full paths relative to public directory
    const images = imageFiles.map(file => `/assets/login/${file}`);
    
    return res.status(200).json({ images });
  } catch (error) {
    console.error('Error reading login images:', error);
    // Return default images as fallback
    return res.status(200).json({ 
      images: [
        '/assets/login/nature01.jpeg',
        '/assets/login/nature02.jpeg',
        '/assets/login/nature03.jpg'
      ]
    });
  }
}

