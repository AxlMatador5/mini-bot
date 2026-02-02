const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const os = require("os");
const path = require("path");

module.exports = {
  name: 'tourl',
  aliases: ['upload', 'imgurl', 'url', 'catbox'],
  description: 'Upload images/media to Catbox and get URL',
  
  async execute(sock, m, args) {
    try {
      await m.react('📤');
      
      const quoted = m.quoted || m;
      const mime = (quoted.msg || quoted).mimetype || "";
      
      if (!mime) {
        await m.react('❌');
        return await m.reply('🚫 *Please reply to a media file!*\n\nSupported: Images, Videos, Audio, Documents');
      }
      
      const buffer = await quoted.download();
      const fileSize = this.formatBytes(buffer.length);
      
      // Check file size limit (32MB for Catbox)
      if (buffer.length > 32 * 1024 * 1024) {
        await m.react('⚠️');
        return await m.reply(`⚠️ *File too large!*\n\nCurrent: ${fileSize}\nLimit: 32MB\n\nTry compressing the file first.`);
      }
      
      // Determine file extension
      let ext = this.getExtensionFromMime(mime);
      const fileName = `mercedes_${Date.now()}${ext}`;
      const tempPath = path.join(os.tmpdir(), fileName);
      
      fs.writeFileSync(tempPath, buffer);
      
      const form = new FormData();
      form.append("fileToUpload", fs.createReadStream(tempPath), fileName);
      form.append("reqtype", "fileupload");
      
      const res = await axios.post("https://catbox.moe/user/api.php", form, {
        headers: form.getHeaders(),
        timeout: 30000
      });
      
      fs.unlinkSync(tempPath);
      
      if (!res.data || res.data.includes('error')) {
        throw new Error('Upload failed');
      }
      
      const fileUrl = res.data;
      const mediaType = this.getMediaType(mime);
      
      const responseText = 
`✅ *${mediaType} Uploaded Successfully!*

📁 *Type:* ${mediaType}
📊 *Size:* ${fileSize}
🔗 *URL:* ${fileUrl}

💡 *Features:*
• Permanent storage
• Direct download link
• No expiration date

🚗 *Mercedes Bot Utility*
> Made by Marisel`;

      await m.reply(responseText);
      await m.react('✅');
      
    } catch (err) {
      console.error('❌ Upload error:', err);
      await m.react('❌');
      await m.reply('❌ Upload failed. Possible reasons:\n• File too large (>32MB)\n• Network error\n• Unsupported file type');
    }
  },
  
  getExtensionFromMime(mime) {
    if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
    if (mime.includes('png')) return '.png';
    if (mime.includes('gif')) return '.gif';
    if (mime.includes('webp')) return '.webp';
    if (mime.includes('video') || mime.includes('mp4')) return '.mp4';
    if (mime.includes('audio') || mime.includes('mpeg')) return '.mp3';
    if (mime.includes('pdf')) return '.pdf';
    if (mime.includes('word') || mime.includes('doc')) return '.doc';
    if (mime.includes('openxml')) return '.docx';
    if (mime.includes('plain') || mime.includes('text')) return '.txt';
    return '.bin';
  },
  
  getMediaType(mime) {
    if (mime.startsWith('image')) return 'Image';
    if (mime.startsWith('video')) return 'Video';
    if (mime.startsWith('audio')) return 'Audio';
    if (mime.includes('pdf')) return 'PDF Document';
    if (mime.includes('word') || mime.includes('doc')) return 'Word Document';
    if (mime.includes('text') || mime.includes('plain')) return 'Text File';
    return 'File';
  },
  
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};
