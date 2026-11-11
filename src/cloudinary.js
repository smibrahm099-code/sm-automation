// Uploads go straight from the admin page to Cloudinary (free plan: images up to 10 MB, videos up to 100 MB).
const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
export const cloudinaryReady = Boolean(cloud && preset)

export function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (!cloudinaryReady) return reject(new Error('Uploads are not set up. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env and restart.'))
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : ''
    if (!kind) return reject(new Error('Only photos and videos can be uploaded.'))
    if (file.size > (kind === 'video' ? 100 : 10) * 1024 * 1024) return reject(new Error(kind === 'video' ? 'This video is over 100 MB.' : 'This photo is over 10 MB.'))
    const fd = new FormData()
    fd.append('file', file); fd.append('upload_preset', preset)
    const x = new XMLHttpRequest()
    x.open('POST', `https://api.cloudinary.com/v1_1/${cloud}/${kind}/upload`)
    x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)) }
    x.onload = () => {
      try {
        const r = JSON.parse(x.responseText)
        if (x.status >= 200 && x.status < 300) resolve({url: r.secure_url, kind})
        else reject(new Error(r.error?.message || 'Upload failed.'))
      } catch { reject(new Error('Upload failed.')) }
    }
    x.onerror = () => reject(new Error('Network error while uploading.'))
    x.send(fd)
  })
}

// a still picture taken from the video, used as its cover image
export const posterFromVideo = u => u && u.includes('/video/upload/') ? u.replace('/video/upload/', '/video/upload/so_1/').replace(/\.[a-z0-9]+$/i, '.jpg') : ''
