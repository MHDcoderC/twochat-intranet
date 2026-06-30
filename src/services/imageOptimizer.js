const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const sharp = require('sharp');
const { UPLOAD_DIR } = require('../config');

async function optimizeImageOnDisk(absInputPath) {
  const outName = `${Date.now()}-${crypto.randomUUID()}-opt.jpg`;
  const outAbs = path.join(UPLOAD_DIR, outName);

  const input = await fs.readFile(absInputPath);
  const meta = await sharp(input).metadata();
  let pipeline = sharp(input).rotate();
  if ((meta.width && meta.width > 1280) || (meta.height && meta.height > 1280)) {
    pipeline = pipeline.resize({
      width: 1280,
      height: 1280,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  await pipeline
    .jpeg({ quality: 62, mozjpeg: true, progressive: true })
    .toFile(outAbs);

  await fs.unlink(absInputPath).catch(() => {});

  const stat = await fs.stat(outAbs);
  return { filename: outName, mime: 'image/jpeg', size: stat.size };
}

module.exports = { optimizeImageOnDisk };
