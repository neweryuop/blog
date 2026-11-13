/**
 * 轻量 Markdown 渲染器
 * 支持：标题、粗体、斜体、删除线、行内代码、代码块、链接、图片、
 *       无序 / 有序列表、引用、分割线、表格、段落
 * 不依赖任何外部库。
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function inline(text) {
    // 行内代码先占位，避免被其他规则误伤
    var codes = [];
    text = text.replace(/`([^`]+)`/g, function (_, c) {
      codes.push('<code>' + escapeHtml(c) + '</code>');
      return '\u0000CODE' + (codes.length - 1) + '\u0000';
    });

    // 图片
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (_, alt, src) {
      return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" loading="lazy" />';
    });

    // 链接
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (_, label, href) {
      return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });

    // 粗体
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 斜体
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    // 删除线
    text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    // 恢复代码
    text = text.replace(/\u0000CODE(\d+)\u0000/g, function (_, i) {
      return codes[+i];
    });

    return text;
  }

  function parse(src) {
    src = String(src).replace(/\r\n?/g, '\n');

    // 提取代码块
    var blocks = [];
    src = src.replace(/```([\w+-]*)\n([\s\S]*?)```/g, function (_, lang, code) {
      var cls = lang ? ' class="language-' + escapeHtml(lang) + '"' : '';
      blocks.push('<pre><code' + cls + '>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>');
      return '\u0000BLOCK' + (blocks.length - 1) + '\u0000';
    });

    var lines = src.split('\n');
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (/^\s*$/.test(line)) { i++; continue; }

      // 代码块占位
      var bm = /^\s*\u0000BLOCK(\d+)\u0000\s*$/.exec(line);
      if (bm) {
        out.push(blocks[+bm[1]]);
        i++;
        continue;
      }

      // 标题
      var hm = /^(#{1,6})\s+(.*)$/.exec(line);
      if (hm) {
        var lv = hm[1].length;
        out.push('<h' + lv + '>' + inline(hm[2].trim()) + '</h' + lv + '>');
        i++;
        continue;
      }

      // 分割线
      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
        out.push('<hr />');
        i++;
        continue;
      }

      // 引用（递归解析内部）
      if (/^\s*>\s?/.test(line)) {
        var qs = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          qs.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + parse(qs.join('\n')) + '</blockquote>');
        continue;
      }

      // 无序列表
      if (/^\s*[-*+]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          ul.push('<li>' + inline(lines[i].replace(/^\s*[-*+]\s+/, '').trim()) + '</li>');
          i++;
        }
        out.push('<ul>' + ul.join('') + '</ul>');
        continue;
      }

      // 有序列表
      if (/^\s*\d+\.\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          ol.push('<li>' + inline(lines[i].replace(/^\s*\d+\.\s+/, '').trim()) + '</li>');
          i++;
        }
        out.push('<ol>' + ol.join('') + '</ol>');
        continue;
      }

      // 表格
      if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
        var splitRow = function (row) {
          return row.split('|')
            .map(function (s) { return s.trim(); })
            .filter(function (s, idx, arr) {
              return !(idx === 0 && s === '') && !(idx === arr.length - 1 && s === '');
            });
        };

        var head = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
          rows.push(splitRow(lines[i]));
          i++;
        }

        var thead = '<thead><tr>' + head.map(function (h) {
          return '<th>' + inline(h) + '</th>';
        }).join('') + '</tr></thead>';

        var tbody = '<tbody>' + rows.map(function (r) {
          return '<tr>' + r.map(function (c) {
            return '<td>' + inline(c) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody>';

        out.push('<div class="table-wrap"><table>' + thead + tbody + '</table></div>');
        continue;
      }

      // 段落（连续非空、非块级起始的行）
      var ps = [];
      while (i < lines.length &&
             !/^\s*$/.test(lines[i]) &&
             !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|>\s*|\u0000BLOCK|\s*(---|\*\*\*|___)\s*$)/.test(lines[i])) {
        ps.push(lines[i]);
        i++;
      }

      if (ps.length) {
        out.push('<p>' + inline(ps.join(' ').trim()) + '</p>');
      } else {
        i++;
      }
    }

    return out.join('\n');
  }

  global.md = { parse: parse };
})(window);