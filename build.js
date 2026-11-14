// build.js
const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, 'posts');
const OUT_FILE = path.join(__dirname, 'posts.json');

// 检查目录是否存在
if (!fs.existsSync(POSTS_DIR)) {
  console.error('[build] 错误: posts/ 目录不存在。请先创建目录并放入 .md 文件。');
  process.exit(1);
}

function parseFrontMatter(raw) {
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(raw);
  if (!m) return { data: {}, body: raw };
  
  const data = {};
  const lines = m[1].split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    
    let val = line.slice(idx + 1).trim();

    // 1. 处理多行 YAML 数组 (如 tags:\n  - 架构\n  - 前端)
    if (val === '' && i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
      val = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        i++;
        val.push(lines[i].replace(/^\s*-\s+/, '').replace(/^["']|["']$/g, '').trim());
      }
    } 
    // 2. 处理单行数组 (如 tags: [架构, 前端])
    else if (/^\[.*\]$/.test(val)) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } 
    // 3. 普通字符串
    else {
      val = val.replace(/^["']|["']$/g, '');
    }
    
    data[key] = val;
  }
  
  return { data, body: raw.slice(m[0].length) };
}

function makeExcerpt(body, len) {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > len ? text.slice(0, len).trim() + '…' : text;
}

const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));

const posts = files.map(f => {
  const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
  const { data, body } = parseFrontMatter(raw);
  const slug = f.replace(/\.md$/, '');
  const tags = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);
  return {
    slug,
    title: data.title || slug,
    date: data.date || '',
    tags,
    excerpt: data.excerpt || makeExcerpt(body, 90),
    readingTime: Math.max(1, Math.round(body.replace(/\s/g, '').length / 350))
  };
});

posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));

fs.writeFileSync(OUT_FILE, JSON.stringify(posts, null, 2), 'utf8');
console.log(`[build] 已生成 posts.json，共 ${posts.length} 篇文章。`);