/*!
 * Taller PDF — runtime  ·  pdf-template.js  ·  formato "taller-pdf/v1"
 *
 * Dibuja una plantilla hecha en Taller PDF con datos reales.
 *
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
 *   <script src="pdf-template.js"></script>
 *   const doc = await PdfTemplate.render(plantilla, datos);   // -> documento jsPDF
 *   doc.save('archivo.pdf');                                   // o doc.output('blob' | 'datauristring')
 *
 * Opcional para códigos QR: qrcode-generator 1.4.4 (window.qrcode).
 * Unidades: milímetros. Tamaño de letra: puntos. Origen arriba a la izquierda.
 * Este mismo archivo dibuja el lienzo del editor, así que el PDF sale igual a lo que se ve.
 */
(function umd(root, factory) {
  var BANNER = '/*!\n * Taller PDF — runtime  ·  pdf-template.js  ·  formato "taller-pdf/v1"\n *\n * Dibuja una plantilla hecha en Taller PDF con datos reales.\n *\n *   <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>\n *   <script src="pdf-template.js"></script>\n *   const doc = await PdfTemplate.render(plantilla, datos);   // -> documento jsPDF\n *   doc.save(\'archivo.pdf\');                                   // o doc.output(\'blob\' | \'datauristring\')\n *\n * Opcional para códigos QR: qrcode-generator 1.4.4 (window.qrcode).\n * Unidades: milímetros. Tamaño de letra: puntos. Origen arriba a la izquierda.\n * Este mismo archivo dibuja el lienzo del editor, así que el PDF sale igual a lo que se ve.\n */\n';
  var ROOT = "typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this";
  var api = factory(root);
  // Fuente exacta de este archivo (el editor la exporta junto con la plantilla).
  api.source = function () {
    return BANNER + '(' + umd.toString() + ')(' + ROOT + ', ' + factory.toString() + ');\n';
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PdfTemplate = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = '1.2.0';
  var FORMAT = 'taller-pdf/v1';
  var PT = 25.4 / 72;              // mm por punto
  var ASC = 0.718, DESC = 0.207;   // métrica de Helvetica por em (sirve para centrar la línea)

  var SIZES = {
    letter: { name: 'Carta (Letter)', w: 215.9, h: 279.4 },
    legal: { name: 'Oficio (Legal)', w: 215.9, h: 355.6 },
    a4: { name: 'A4', w: 210, h: 297 },
    a5: { name: 'A5', w: 148, h: 210 },
    a3: { name: 'A3', w: 297, h: 420 },
    halfletter: { name: 'Media carta', w: 139.7, h: 215.9 },
    label4x6: { name: 'Etiqueta 4×6 in', w: 101.6, h: 152.4 },
    label4x3: { name: 'Etiqueta 4×3 in', w: 101.6, h: 76.2 },
    label2x1: { name: 'Etiqueta 2×1 in', w: 50.8, h: 25.4 }
  };

  // Las 3 familias que trae todo PDF (no hace falta archivo). "times" es la Times New Roman.
  var STD_FONTS = {
    helvetica: { name: 'Helvetica / Arial', css: 'Helvetica, Arial, "Liberation Sans", sans-serif' },
    times: { name: 'Times New Roman', css: '"Times New Roman", Times, "Liberation Serif", serif' },
    courier: { name: 'Courier New', css: '"Courier New", Courier, "Liberation Mono", monospace' }
  };
  // Nombres que la gente escribe y a qué familia del PDF corresponden
  var FONT_ALIAS = {
    'times new roman': 'times', 'timesnewroman': 'times', 'times-roman': 'times', 'times roman': 'times', 'tnr': 'times', 'serif': 'times', 'georgia': 'times',
    'arial': 'helvetica', 'helvetica neue': 'helvetica', 'sans-serif': 'helvetica', 'sans serif': 'helvetica', 'calibri': 'helvetica', 'verdana': 'helvetica', 'segoe ui': 'helvetica',
    'courier new': 'courier', 'couriernew': 'courier', 'monospace': 'courier', 'consolas': 'courier'
  };

  /* ------------------------------------------------------------------ utilidades */

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date); }
  function deepMerge(base, over) {
    var out = {}, k;
    for (k in base) out[k] = isObj(base[k]) ? deepMerge(base[k], null) : base[k];
    if (over) for (k in over) {
      if (over[k] === undefined) continue;
      out[k] = isObj(over[k]) && isObj(out[k]) ? deepMerge(out[k], over[k]) : over[k];
    }
    return out;
  }
  function num0(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function hexRGB(hex) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    if (isNaN(n)) n = 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function r3(n) { return Math.round(n * 1000) / 1000; }
  function hashStr(s) {
    var h = 5381, i = s.length, step = Math.max(1, Math.floor(i / 4096));
    for (var j = 0; j < i; j += step) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
    return (h >>> 0).toString(36) + '_' + i.toString(36);
  }

  /* ------------------------------------------------------------------ valores por defecto */

  var BORDER = { width: 0, color: '#000000', sides: 'tblr', dash: '' };
  var BOX = { fill: '', border: BORDER, radius: 0, padding: 0, opacity: 1 };
  var FONT = { font: 'helvetica', size: 10, bold: false, italic: false, underline: false, strike: false, color: '#000000', letterSpacing: 0 };
  var COMMON = { id: '', type: 'text', name: '', x: 0, y: 0, w: 40, h: 10, repeat: false, follow: false, showIf: '', locked: false, hidden: false };
  var DEFAULTS = {
    text: [BOX, FONT, { text: '', align: 'left', valign: 'top', lineHeight: 1.2, fit: 'wrap', rotate: 0, padding: 0.5 }],
    field: [BOX, FONT, { label: 'Campo:', value: '', labelBold: true, labelColor: '', labelWidth: 0, gap: 2, rows: 1, align: 'left',
      line: { width: 0.25, color: '#000000', dash: '' } }],
    rect: [BOX, { fill: '#e6e6e6' }],
    ellipse: [BOX, { fill: '#e6e6e6' }],
    line: [{ color: '#000000', width: 0.3, dash: '', flip: false, cap: 'butt', opacity: 1 }],
    image: [BOX, { src: '', bind: '', fit: 'contain' }],
    table: [FONT, { size: 9, source: 'items', columns: [], lineHeight: 1.15, padding: 1.5, rowHeight: 6, valign: 'middle', zebra: '', fill: '',
      header: { show: true, repeat: true, fill: '#e6e6e6', color: '#000000', bold: true, size: 0, height: 0 },
      footer: { show: false, fill: '', color: '#000000', bold: true, height: 0 },
      grid: { width: 0.2, color: '#999999', mode: 'all' },
      paginate: true, continueY: null, emptyText: '', opacity: 1 }],
    checkbox: [BOX, FONT, { label: 'Opción', checked: '', mark: 'check', boxSize: 4, boxColor: '#000000', boxWidth: 0.3, boxFill: '', gap: 1.5 }],
    qr: [BOX, { value: '', color: '#000000', level: 'M' }],
    barcode: [BOX, FONT, { value: '', color: '#000000', showText: true, size: 8 }]
  };
  var COLUMN = { id: '', header: '', value: '', width: 1, align: 'left', footer: '' };
  var baseCache = {};
  function baseFor(type) {
    if (baseCache[type]) return baseCache[type];
    var b = deepMerge(COMMON, null), parts = DEFAULTS[type] || [];
    for (var i = 0; i < parts.length; i++) b = deepMerge(b, parts[i]);
    b.type = type;
    return (baseCache[type] = b);
  }
  function withDefaults(el) {
    var out = deepMerge(baseFor(el.type), el);
    if (el.type === 'table') out.columns = (el.columns || []).map(function (c) { return deepMerge(COLUMN, c); });
    return out;
  }

  var PAGE = { size: 'letter', width: 215.9, height: 279.4, margins: { top: 15, right: 15, bottom: 15, left: 15 }, background: '#ffffff' };
  var LOCALE = { lang: 'es', decimal: '.', thousands: ',', currency: '$', currencyPos: 'before', dateFormat: 'MM/DD/YYYY' };

  function normalize(tpl) {
    tpl = tpl || {};
    var pages = tpl.pages && tpl.pages.length ? tpl.pages : [{ elements: [] }];
    return {
      format: FORMAT,
      id: tpl.id || '',
      name: tpl.name || 'Plantilla',
      description: tpl.description || '',
      page: deepMerge(PAGE, tpl.page),
      locale: deepMerge(LOCALE, tpl.locale),
      fonts: tpl.fonts || [],
      assets: tpl.assets || {},
      // Encabezado y pie de página: sale en todas las hojas impresas (showOn: all | notFirst | first | none)
      master: { showOn: (tpl.master && tpl.master.showOn) || 'all', elements: (tpl.master && tpl.master.elements) || [] },
      pages: pages.map(function (p, i) {
        return { id: p.id || 'p' + (i + 1), name: p.name || 'Página ' + (i + 1), repeatFor: p.repeatFor || '', noMaster: !!p.noMaster, elements: p.elements || [] };
      }),
      sampleData: tpl.sampleData || {}
    };
  }

  /* ------------------------------------------------------------------ expresiones {{ ... }} */

  var MONTHS = {
    es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };
  var DAYS = {
    es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  };

  var TOKEN_RE = /\{\{([\s\S]+?)\}\}/g;
  var LEX_RE = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(==|!=|>=|<=|&&|\|\||[-+*\/%()?:<>!\[\].,])|([\p{L}_$][\p{L}\p{N}_$]*))/uy;

  function lex(src) {
    var toks = [], i = 0, m;
    while (i < src.length) {
      LEX_RE.lastIndex = i;
      m = LEX_RE.exec(src);
      if (!m || m[0].length === 0) {
        if (/^\s*$/.test(src.slice(i))) break;
        throw new Error('carácter inesperado "' + src.charAt(i) + '"');
      }
      i = LEX_RE.lastIndex;
      if (m[1] != null) toks.push({ k: 'num', v: parseFloat(m[1]) });
      else if (m[2] != null) toks.push({ k: 'str', v: m[2].slice(1, -1).replace(/\\(.)/g, '$1') });
      else if (m[3] != null) toks.push({ k: 'op', v: m[3] });
      else if (m[4] != null) toks.push({ k: 'id', v: m[4] });
    }
    return toks;
  }

  function parseAst(src) {
    var t = lex(src), i = 0;
    function peek(v) { return t[i] && t[i].k === 'op' && t[i].v === v; }
    function eat(v) { if (!peek(v)) throw new Error('se esperaba "' + v + '"'); i++; }
    function ternary() {
      var c = or();
      if (peek('?')) { i++; var a = ternary(); eat(':'); var b = ternary(); return { k: 'tern', c: c, a: a, b: b }; }
      return c;
    }
    function or() { var a = and(); while (peek('||')) { i++; a = { k: 'bin', op: '||', a: a, b: and() }; } return a; }
    function and() { var a = cmp(); while (peek('&&')) { i++; a = { k: 'bin', op: '&&', a: a, b: cmp() }; } return a; }
    function cmp() {
      var a = add();
      if (t[i] && t[i].k === 'op' && /^(==|!=|>=|<=|>|<)$/.test(t[i].v)) { var op = t[i++].v; a = { k: 'bin', op: op, a: a, b: add() }; }
      return a;
    }
    function add() { var a = mul(); while (peek('+') || peek('-')) { var op = t[i++].v; a = { k: 'bin', op: op, a: a, b: mul() }; } return a; }
    function mul() { var a = un(); while (peek('*') || peek('/') || peek('%')) { var op = t[i++].v; a = { k: 'bin', op: op, a: a, b: un() }; } return a; }
    function un() {
      if (peek('!')) { i++; return { k: 'un', op: '!', a: un() }; }
      if (peek('-')) { i++; return { k: 'un', op: '-', a: un() }; }
      return prim();
    }
    function prim() {
      var tk = t[i];
      if (!tk) throw new Error('expresión incompleta');
      if (tk.k === 'num') { i++; return { k: 'lit', v: tk.v }; }
      if (tk.k === 'str') { i++; return { k: 'lit', v: tk.v }; }
      if (peek('(')) { i++; var e = ternary(); eat(')'); return e; }
      if (tk.k === 'id') {
        if (tk.v === 'true' || tk.v === 'false') { i++; return { k: 'lit', v: tk.v === 'true' }; }
        if (tk.v === 'null') { i++; return { k: 'lit', v: null }; }
        if (t[i + 1] && t[i + 1].k === 'op' && t[i + 1].v === '(' && FILTERS[tk.v]) {
          // función: sum(items, "precio") equivale a {{ items | sum:"precio" }}
          var fname = tk.v, args = [];
          i += 2;
          if (!peek(')')) {
            for (;;) { args.push(ternary()); if (peek(',')) { i++; continue; } break; }
          }
          eat(')');
          return { k: 'call', f: fname, args: args };
        }
        var segs = [tk.v]; i++;
        for (;;) {
          if (peek('.') && t[i + 1] && (t[i + 1].k === 'id' || t[i + 1].k === 'num')) { segs.push(String(t[i + 1].v)); i += 2; continue; }
          if (peek('[') && t[i + 1] && (t[i + 1].k === 'num' || t[i + 1].k === 'str')) { segs.push(String(t[i + 1].v)); i += 2; eat(']'); continue; }
          break;
        }
        return { k: 'path', p: segs };
      }
      throw new Error('no entiendo "' + tk.v + '"');
    }
    var ast = ternary();
    if (i < t.length) throw new Error('sobra "' + t[i].v + '"');
    return ast;
  }

  // Divide por un separador de un carácter respetando comillas y paréntesis ("||" no corta).
  function splitTop(s, sep) {
    var out = [], cur = '', q = '', depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (q) { cur += c; if (c === '\\') { cur += s.charAt(++i); continue; } if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === sep && depth === 0) {
        if (sep === '|' && (s.charAt(i + 1) === '|' || s.charAt(i - 1) === '|')) { cur += c; continue; }
        out.push(cur); cur = ''; continue;
      }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  var compileCache = {};
  function compile(src) {
    var key = String(src);
    if (compileCache[key]) return compileCache[key];
    var res;
    try {
      var parts = splitTop(key, '|');
      var head = parts[0].trim();
      res = {
        src: key,
        head: head ? parseAst(head) : { k: 'lit', v: '' },
        filters: parts.slice(1).map(function (f) {
          var segs = splitTop(f, ':');
          return {
            name: segs[0].trim(),
            args: segs.slice(1).map(function (a) {
              var raw = a.trim(), ast = null;
              try { ast = parseAst(raw); } catch (e) { ast = null; }
              return { raw: raw.replace(/^(["'])([\s\S]*)\1$/, '$2'), ast: ast };
            })
          };
        })
      };
      res.filters.forEach(function (f) { if (!FILTERS[f.name]) throw new Error('filtro desconocido "' + f.name + '"'); });
    } catch (e) {
      res = { src: key, error: e.message };
    }
    compileCache[key] = res;
    return res;
  }

  function getPath(obj, segs) {
    var v = obj;
    for (var i = 0; i < segs.length; i++) {
      if (v == null) return undefined;
      v = v[segs[i]];
    }
    return v;
  }
  function splitPath(path) {
    return String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(function (s) { return s !== ''; });
  }
  function lookup(segs, scope) {
    var head = segs[0];
    if (head.charAt(0) === '_' && scope.vars && head in scope.vars) return getPath(scope.vars, segs);
    if (head === 'this' || head === '$item') return getPath(scope.chain[0], segs.slice(1));
    if (head === '$root') return getPath(scope.chain[scope.chain.length - 1], segs.slice(1));
    for (var i = 0; i < scope.chain.length; i++) {
      var o = scope.chain[i];
      if (o != null && typeof o === 'object' && head in o) return getPath(o, segs);
    }
    return undefined;
  }

  function toNumber(v, loc) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null || v === '' || typeof v === 'boolean') return v === true ? 1 : v === false ? 0 : null;
    var s = String(v).trim();
    if (loc && loc.thousands) s = s.split(loc.thousands).join('');
    if (loc && loc.decimal && loc.decimal !== '.') s = s.replace(loc.decimal, '.');
    s = s.replace(/[^\d.eE+-]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function isNumLike(v) { return typeof v === 'number' || (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)); }

  function evalAst(n, scope) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'path': return lookup(n.p, scope);
      case 'un': { var a = evalAst(n.a, scope); return n.op === '!' ? !truthy(a) : -Number(a); }
      case 'tern': return truthy(evalAst(n.c, scope)) ? evalAst(n.a, scope) : evalAst(n.b, scope);
      case 'call': {
        var vals = n.args.map(function (a) { return evalAst(a, scope); });
        var raws = vals.slice(1).map(function (v) { return { raw: v == null ? '' : String(v) }; });
        return FILTERS[n.f](vals[0], vals.slice(1), scope.loc, scope, raws);
      }
      case 'bin': {
        if (n.op === '&&') { var l = evalAst(n.a, scope); return truthy(l) ? evalAst(n.b, scope) : l; }
        if (n.op === '||') { var l2 = evalAst(n.a, scope); return truthy(l2) ? l2 : evalAst(n.b, scope); }
        var x = evalAst(n.a, scope), y = evalAst(n.b, scope);
        switch (n.op) {
          case '+':
            if ((x == null || isNumLike(x)) && (y == null || isNumLike(y)) && !(x == null && y == null)) return (toNumber(x) || 0) + (toNumber(y) || 0);
            return (x == null ? '' : toText(x, scope.loc)) + (y == null ? '' : toText(y, scope.loc));
          case '-': return (toNumber(x) || 0) - (toNumber(y) || 0);
          case '*': return (toNumber(x) || 0) * (toNumber(y) || 0);
          case '/': { var d = toNumber(y); return d ? (toNumber(x) || 0) / d : null; }
          case '%': { var d2 = toNumber(y); return d2 ? (toNumber(x) || 0) % d2 : null; }
          case '==': return looseEq(x, y);
          case '!=': return !looseEq(x, y);
          case '>': return cmpVals(x, y) > 0;
          case '<': return cmpVals(x, y) < 0;
          case '>=': return cmpVals(x, y) >= 0;
          case '<=': return cmpVals(x, y) <= 0;
        }
      }
    }
    return undefined;
  }
  function looseEq(a, b) {
    if (isNumLike(a) && isNumLike(b)) return Number(a) === Number(b);
    if (a == null || b == null) return (a == null || a === '') && (b == null || b === '');
    return String(a).toLowerCase() === String(b).toLowerCase();
  }
  function cmpVals(a, b) {
    if (isNumLike(a) && isNumLike(b)) return Number(a) - Number(b);
    var da = a instanceof Date ? a : null, db = b instanceof Date ? b : null;
    if (da || db) return (toDate(a) || 0) - (toDate(b) || 0);
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b));
  }
  function truthy(v) {
    if (v == null || v === false || v === 0 || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return !/^(false|no|0|n|off)$/i.test(v.trim());
    return true;
  }

  function evaluate(src, scope) {
    var c = compile(src);
    if (c.error) { warn(scope, '{{' + src + '}}: ' + c.error); return undefined; }
    var v = evalAst(c.head, scope);
    for (var i = 0; i < c.filters.length; i++) {
      var f = c.filters[i];
      var args = f.args.map(function (a) {
        if (a.ast) {
          var r = evalAst(a.ast, scope);
          if (r !== undefined) return r;
        }
        return a.raw;
      });
      try { v = FILTERS[f.name](v, args, scope.loc, scope, f.args); } catch (e) { warn(scope, f.name + ': ' + e.message); }
    }
    return v;
  }
  function warn(scope, msg) {
    var ctx = scope && scope.ctx;
    if (ctx && ctx.warnings.indexOf(msg) < 0) ctx.warnings.push(msg);
  }

  function toText(v, loc) {
    loc = loc || LOCALE;
    if (v == null) return '';
    if (v instanceof Date) return fmtDate(v, loc.dateFormat, loc.lang);
    if (typeof v === 'number') return isFinite(v) ? String(Math.round(v * 1e10) / 1e10) : '';
    if (typeof v === 'boolean') return v ? (loc.lang === 'en' ? 'Yes' : 'Sí') : 'No';
    if (Array.isArray(v)) return v.map(function (x) { return toText(x, loc); }).join(', ');
    if (typeof v === 'object') {
      if (typeof v.toDate === 'function' || typeof v.seconds === 'number') { var d = toDate(v); return d ? fmtDate(d, loc.dateFormat, loc.lang) : ''; }
      return '';
    }
    return String(v);
  }

  function interpolate(str, scope) {
    if (str == null) return '';
    str = String(str);
    if (scope.raw || str.indexOf('{{') < 0) return str;
    return str.replace(TOKEN_RE, function (m, e) { return toText(evaluate(e.trim(), scope), scope.loc); });
  }
  // "{{x}}" sola devuelve el valor tal cual (lista, booleano, imagen); "x" también se toma como ruta/expresión.
  function binding(str, scope) {
    if (str == null || str === '') return undefined;
    str = String(str).trim();
    var m = /^\{\{([\s\S]+?)\}\}$/.exec(str);
    if (m && m[1].indexOf('{{') < 0) return evaluate(m[1].trim(), scope);
    if (str.indexOf('{{') >= 0) return interpolate(str, scope);
    return evaluate(str, scope);
  }

  /* fechas y números */

  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'object') {
      if (typeof v.toDate === 'function') { try { return v.toDate(); } catch (e) { return null; } }
      if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
      return null;
    }
    if (typeof v === 'number') return new Date(v);
    var s = String(v).trim();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function dayOfYear(d) {
    return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1;
  }
  function fmtDate(d, fmt, lang) {
    var L = MONTHS[lang] ? lang : 'es';
    fmt = fmt || 'MM/DD/YYYY';
    return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DDD|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A/g, function (t, lit) {
      if (lit != null) return lit;
      var h = d.getHours();
      switch (t) {
        case 'YYYY': return String(d.getFullYear());
        case 'YY': return pad(d.getFullYear() % 100, 2);
        case 'MMMM': return MONTHS[L][d.getMonth()];
        case 'MMM': return MONTHS[L][d.getMonth()].slice(0, 3);
        case 'MM': return pad(d.getMonth() + 1, 2);
        case 'M': return String(d.getMonth() + 1);
        case 'DDD': return pad(dayOfYear(d), 3);
        case 'DD': return pad(d.getDate(), 2);
        case 'D': return String(d.getDate());
        case 'dddd': return DAYS[L][d.getDay()];
        case 'ddd': return DAYS[L][d.getDay()].slice(0, 3);
        case 'HH': return pad(h, 2);
        case 'H': return String(h);
        case 'hh': return pad(h % 12 || 12, 2);
        case 'h': return String(h % 12 || 12);
        case 'mm': return pad(d.getMinutes(), 2);
        case 'ss': return pad(d.getSeconds(), 2);
        case 'A': return h < 12 ? 'AM' : 'PM';
      }
      return t;
    });
  }
  function fmtNum(n, dec, loc) {
    n = Number(n);
    if (!isFinite(n)) return '';
    dec = Math.max(0, Math.min(10, dec | 0));
    var s = Math.abs(n).toFixed(dec), parts = s.split('.'), int = parts[0], out = '';
    while (int.length > 3) { out = loc.thousands + int.slice(-3) + out; int = int.slice(0, -3); }
    out = int + out + (parts[1] ? loc.decimal + parts[1] : '');
    return (n < 0 && Number(s) !== 0 ? '-' : '') + out;
  }
  function list(v) { return Array.isArray(v) ? v : v == null ? [] : [v]; }
  function isEmpty(v) { return v == null || v === '' || (Array.isArray(v) && !v.length); }
  function pickField(x, field, scope) {
    if (field == null || field === '') return x;
    var c = compile(String(field));
    if (c.error) return undefined;
    var sc = { chain: [x], vars: {}, loc: scope.loc, ctx: scope.ctx };
    return evaluate(String(field), sc);
  }
  function nums(v, field, scope) {
    return list(v).map(function (x) { return toNumber(pickField(x, field, scope), scope.loc); }).filter(function (n) { return n != null; });
  }

  var FILTERS = {
    upper: function (v, a, loc) { return toText(v, loc).toUpperCase(); },
    lower: function (v, a, loc) { return toText(v, loc).toLowerCase(); },
    title: function (v, a, loc) { return toText(v, loc).toLowerCase().replace(/(^|[\s\-(])(\p{L})/gu, function (m, p, c) { return p + c.toUpperCase(); }); },
    trim: function (v, a, loc) { return toText(v, loc).trim(); },
    default: function (v, a) { return isEmpty(v) ? (a[0] == null ? '' : a[0]) : v; },
    number: function (v, a, loc) {
      var n = toNumber(v, loc); if (n == null) return '';
      return fmtNum(n, a[0] != null && a[0] !== '' ? +a[0] : (Number.isInteger(n) ? 0 : 2), loc);
    },
    money: function (v, a, loc) {
      var n = toNumber(v, loc); if (n == null) return '';
      var sym = a[0] != null && a[0] !== '' ? String(a[0]) : loc.currency;
      var s = fmtNum(Math.abs(n), a[1] != null && a[1] !== '' ? +a[1] : 2, loc);
      s = loc.currencyPos === 'after' ? s + ' ' + sym : sym + s;
      return n < 0 ? '-' + s : s;
    },
    percent: function (v, a, loc) { var n = toNumber(v, loc); return n == null ? '' : fmtNum(n * 100, a[0] != null && a[0] !== '' ? +a[0] : 0, loc) + '%'; },
    round: function (v, a, loc) { var n = toNumber(v, loc); if (n == null) return ''; var f = Math.pow(10, +a[0] || 0); return Math.round(n * f) / f; },
    abs: function (v, a, loc) { var n = toNumber(v, loc); return n == null ? '' : Math.abs(n); },
    date: function (v, a, loc) {
      var d = toDate(v);
      return d ? fmtDate(d, a[0] || loc.dateFormat, loc.lang) : (v == null ? '' : toText(v, loc));
    },
    pad: function (v, a, loc) { var s = toText(v, loc), n = +a[0] || 0, c = a[1] != null && a[1] !== '' ? String(a[1]) : '0'; while (s.length < n) s = c + s; return s; },
    truncate: function (v, a, loc) { var s = toText(v, loc), n = +a[0]; return n > 0 && s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s; },
    prefix: function (v, a, loc) { return isEmpty(v) ? '' : String(a[0] == null ? '' : a[0]) + toText(v, loc); },
    suffix: function (v, a, loc) { return isEmpty(v) ? '' : toText(v, loc) + String(a[0] == null ? '' : a[0]); },
    check: function (v, a) { return truthy(v) ? (a[0] != null && a[0] !== '' ? a[0] : '✓') : (a[1] != null ? a[1] : '✗'); },
    yesno: function (v, a, loc) { return truthy(v) ? (a[0] != null ? a[0] : loc.lang === 'en' ? 'Yes' : 'Sí') : (a[1] != null ? a[1] : 'No'); },
    replace: function (v, a, loc) { return toText(v, loc).split(String(a[0] == null ? '' : a[0])).join(String(a[1] == null ? '' : a[1])); },
    count: function (v) { return Array.isArray(v) ? v.length : v == null || v === '' ? 0 : 1; },
    sum: function (v, a, loc, sc, raw) { return nums(v, raw[0] ? raw[0].raw : '', sc).reduce(function (s, n) { return s + n; }, 0); },
    avg: function (v, a, loc, sc, raw) { var n = nums(v, raw[0] ? raw[0].raw : '', sc); return n.length ? n.reduce(function (s, x) { return s + x; }, 0) / n.length : null; },
    min: function (v, a, loc, sc, raw) { var n = nums(v, raw[0] ? raw[0].raw : '', sc); return n.length ? Math.min.apply(null, n) : null; },
    max: function (v, a, loc, sc, raw) { var n = nums(v, raw[0] ? raw[0].raw : '', sc); return n.length ? Math.max.apply(null, n) : null; },
    join: function (v, a, loc, sc, raw) {
      var field = raw[1] ? raw[1].raw : '';
      return list(v).map(function (x) { return toText(pickField(x, field, sc), loc); }).join(a[0] != null ? String(a[0]) : ', ');
    },
    first: function (v) { return list(v)[0]; },
    last: function (v) { var l = list(v); return l[l.length - 1]; }
  };

  /* ------------------------------------------------------------------ fuentes y medidas */

  var CP1252 = { 8364: 1, 8218: 1, 402: 1, 8222: 1, 8230: 1, 8224: 1, 8225: 1, 710: 1, 8240: 1, 352: 1, 8249: 1, 338: 1, 381: 1, 8216: 1, 8217: 1,
    8220: 1, 8221: 1, 8226: 1, 8211: 1, 8212: 1, 732: 1, 8482: 1, 353: 1, 8250: 1, 339: 1, 382: 1, 376: 1 };
  // Las fuentes estándar del PDF sólo traen el juego Windows-1252; lo demás sale como "?".
  /* Símbolos y emojis que se DIBUJAN (líneas y figuras), así salen con cualquier letra y sin archivos de fuente.
     Cada uno ocupa "adv" em de ancho y se dibuja en un cuadro de 0..1 (y hacia abajo). */
  var C_GREEN = '#1e9e4a', C_RED = '#d93025', C_YELLOW = '#f5b301', C_BLUE = '#1a73e8';
  function starPts(cx, cy, ro, ri) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return pts;
  }
  var CHECK = [[0.13, 0.54], [0.4, 0.8], [0.88, 0.22]], XA = [[0.2, 0.2], [0.8, 0.8]], XB = [[0.8, 0.2], [0.2, 0.8]];
  var SYM = {
    '✓': { adv: 0.8, sh: [{ pl: CHECK, sw: 0.11 }], name: 'Palomita' },
    '✔': { adv: 0.8, sh: [{ pl: CHECK, sw: 0.18 }], name: 'Palomita gruesa' },
    '✅': { adv: 0.95, sh: [{ box: 1, fill: C_GREEN, r: 0.2 }, { pl: [[0.22, 0.52], [0.42, 0.72], [0.78, 0.3]], sw: 0.13, color: '#ffffff' }], name: 'Palomita verde' },
    '☑': { adv: 0.95, sh: [{ box: 0.9, sw: 0.07 }, { pl: [[0.24, 0.52], [0.43, 0.72], [0.78, 0.28]], sw: 0.1 }], name: 'Casilla con palomita' },
    '✗': { adv: 0.8, sh: [{ ln: XA, sw: 0.11 }, { ln: XB, sw: 0.11 }], name: 'Equis' },
    '✘': { adv: 0.8, sh: [{ ln: XA, sw: 0.18 }, { ln: XB, sw: 0.18 }], name: 'Equis gruesa' },
    '✕': { adv: 0.8, sh: [{ ln: [[0.25, 0.25], [0.75, 0.75]], sw: 0.09 }, { ln: [[0.75, 0.25], [0.25, 0.75]], sw: 0.09 }], name: 'Por' },
    '✖': { adv: 0.8, sh: [{ ln: [[0.22, 0.22], [0.78, 0.78]], sw: 0.17 }, { ln: [[0.78, 0.22], [0.22, 0.78]], sw: 0.17 }], name: 'Por grueso' },
    '❌': { adv: 0.95, sh: [{ ln: [[0.17, 0.17], [0.83, 0.83]], sw: 0.2, color: C_RED }, { ln: [[0.83, 0.17], [0.17, 0.83]], sw: 0.2, color: C_RED }], name: 'Equis roja' },
    '❎': { adv: 0.95, sh: [{ box: 1, fill: C_GREEN, r: 0.2 }, { ln: [[0.3, 0.3], [0.7, 0.7]], sw: 0.12, color: '#ffffff' }, { ln: [[0.7, 0.3], [0.3, 0.7]], sw: 0.12, color: '#ffffff' }], name: 'Equis verde' },
    '☒': { adv: 0.95, sh: [{ box: 0.9, sw: 0.07 }, { ln: [[0.27, 0.27], [0.73, 0.73]], sw: 0.09 }, { ln: [[0.73, 0.27], [0.27, 0.73]], sw: 0.09 }], name: 'Casilla con X' },
    '☐': { adv: 0.95, sh: [{ box: 0.9, sw: 0.07 }], name: 'Casilla vacía' },
    '★': { adv: 0.95, sh: [{ pg: starPts(0.5, 0.53, 0.5, 0.21), fill: true }], name: 'Estrella' },
    '☆': { adv: 0.95, sh: [{ pg: starPts(0.5, 0.53, 0.48, 0.2), sw: 0.06 }], name: 'Estrella vacía' },
    '⭐': { adv: 0.95, sh: [{ pg: starPts(0.5, 0.53, 0.5, 0.21), fill: C_YELLOW }], name: 'Estrella amarilla' },
    '⚠': { adv: 0.95, sh: [{ pg: [[0.5, 0.06], [0.97, 0.9], [0.03, 0.9]], sw: 0.07 }, { ln: [[0.5, 0.36], [0.5, 0.62]], sw: 0.09 }, { dot: [0.5, 0.76], r: 0.055 }], name: 'Atención' },
    '⚠️': { adv: 0.95, sh: [{ pg: [[0.5, 0.06], [0.97, 0.9], [0.03, 0.9]], fill: C_YELLOW, sw: 0.05, color: '#3a3000' }, { ln: [[0.5, 0.36], [0.5, 0.62]], sw: 0.09, color: '#141414' }, { dot: [0.5, 0.76], r: 0.055, color: '#141414' }], name: 'Atención amarilla' },
    '→': { adv: 1, sh: [{ ln: [[0.08, 0.5], [0.86, 0.5]], sw: 0.08 }, { pl: [[0.6, 0.24], [0.88, 0.5], [0.6, 0.76]], sw: 0.08 }], name: 'Flecha derecha' },
    '←': { adv: 1, sh: [{ ln: [[0.92, 0.5], [0.14, 0.5]], sw: 0.08 }, { pl: [[0.4, 0.24], [0.12, 0.5], [0.4, 0.76]], sw: 0.08 }], name: 'Flecha izquierda' },
    '↑': { adv: 0.7, sh: [{ ln: [[0.5, 0.95], [0.5, 0.12]], sw: 0.08 }, { pl: [[0.24, 0.38], [0.5, 0.1], [0.76, 0.38]], sw: 0.08 }], name: 'Flecha arriba' },
    '↓': { adv: 0.7, sh: [{ ln: [[0.5, 0.05], [0.5, 0.88]], sw: 0.08 }, { pl: [[0.24, 0.62], [0.5, 0.9], [0.76, 0.62]], sw: 0.08 }], name: 'Flecha abajo' },
    '●': { adv: 0.85, sh: [{ dot: [0.5, 0.5], r: 0.34 }], name: 'Círculo' },
    '○': { adv: 0.85, sh: [{ ring: [0.5, 0.5], r: 0.33, sw: 0.07 }], name: 'Círculo vacío' },
    '■': { adv: 0.85, sh: [{ box: 0.66, fill: true }], name: 'Cuadro' },
    '□': { adv: 0.85, sh: [{ box: 0.66, sw: 0.07 }], name: 'Cuadro vacío' },
    '▲': { adv: 0.85, sh: [{ pg: [[0.5, 0.16], [0.86, 0.82], [0.14, 0.82]], fill: true }], name: 'Triángulo arriba' },
    '▼': { adv: 0.85, sh: [{ pg: [[0.14, 0.2], [0.86, 0.2], [0.5, 0.86]], fill: true }], name: 'Triángulo abajo' },
    '🟢': { adv: 0.95, sh: [{ dot: [0.5, 0.5], r: 0.44, color: C_GREEN }], name: 'Verde' },
    '🔴': { adv: 0.95, sh: [{ dot: [0.5, 0.5], r: 0.44, color: C_RED }], name: 'Rojo' },
    '🟡': { adv: 0.95, sh: [{ dot: [0.5, 0.5], r: 0.44, color: C_YELLOW }], name: 'Amarillo' },
    '🔵': { adv: 0.95, sh: [{ dot: [0.5, 0.5], r: 0.44, color: C_BLUE }], name: 'Azul' },
    '≥': { adv: 0.6, sh: [{ pl: [[0.15, 0.12], [0.85, 0.4], [0.15, 0.68]], sw: 0.09 }, { ln: [[0.15, 0.88], [0.85, 0.88]], sw: 0.09 }], name: 'Mayor o igual' },
    '≤': { adv: 0.6, sh: [{ pl: [[0.85, 0.12], [0.15, 0.4], [0.85, 0.68]], sw: 0.09 }, { ln: [[0.15, 0.88], [0.85, 0.88]], sw: 0.09 }], name: 'Menor o igual' },
    '≠': { adv: 0.6, sh: [{ ln: [[0.12, 0.36], [0.88, 0.36]], sw: 0.08 }, { ln: [[0.12, 0.64], [0.88, 0.64]], sw: 0.08 }, { ln: [[0.68, 0.08], [0.32, 0.92]], sw: 0.08 }], name: 'Distinto' }
  };
  // Las versiones "emoji" de Windows/teléfono (con selector de variante) se tratan igual
  SYM['✔️'] = SYM['✔']; SYM['✖️'] = SYM['✖']; SYM['☑️'] = SYM['☑']; SYM['☐️'] = SYM['☐'];
  SYM['⬆'] = SYM['↑']; SYM['⬇'] = SYM['↓']; SYM['➡'] = SYM['→']; SYM['⬅'] = SYM['←']; SYM['➡️'] = SYM['→']; SYM['⬅️'] = SYM['←']; SYM['⬆️'] = SYM['↑']; SYM['⬇️'] = SYM['↓'];
  SYM['✗️'] = SYM['✗'];
  var SYM_KEYS = Object.keys(SYM).sort(function (a, b) { return b.length - a.length; });
  function reEsc(c) { return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var SYM_SPLIT = new RegExp('(' + SYM_KEYS.map(reEsc).join('|') + ')', 'u');
  var SYM_TEST = new RegExp(SYM_KEYS.map(reEsc).join('|'), 'u');

  // Dibuja un símbolo con su caja a partir de x (inicio) y la línea base
  function drawSym(out, ch, x, base, sizeMM, color) {
    var sym = SYM[ch], adv = sym.adv * sizeMM, side = sizeMM * 0.8;
    var x0 = x + (adv - side) / 2, y0 = base - 0.36 * sizeMM - side / 2;
    function P(q) { return [r3(x0 + q[0] * side), r3(y0 + q[1] * side)]; }
    sym.sh.forEach(function (sh) {
      var col = sh.color || color;
      if (sh.pl) out.push({ t: 'poly', pts: sh.pl.map(P), closed: false, stroke: col, lw: sh.sw * side, cap: 'round', join: 'round' });
      else if (sh.ln) { var a = P(sh.ln[0]), b = P(sh.ln[1]); out.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col, lw: sh.sw * side, cap: 'round' }); }
      else if (sh.pg) out.push({ t: 'poly', pts: sh.pg.map(P), closed: true, fill: sh.fill ? (sh.fill === true ? col : sh.fill) : '', stroke: sh.sw ? (sh.fill && sh.fill !== true ? sh.color || '#000000' : col) : '', lw: (sh.sw || 0) * side, join: 'round' });
      else if (sh.box) {
        var inset = (1 - sh.box) / 2;
        out.push({ t: 'rect', x: r3(x0 + inset * side), y: r3(y0 + inset * side), w: r3(sh.box * side), h: r3(sh.box * side), r: (sh.r || 0.06) * side,
          fill: sh.fill ? (sh.fill === true ? col : sh.fill) : '', stroke: sh.sw ? col : '', lw: (sh.sw || 0) * side });
      } else if (sh.dot) { var c = P(sh.dot); out.push({ t: 'ellipse', cx: c[0], cy: c[1], rx: sh.r * side, ry: sh.r * side, fill: col, stroke: '', lw: 0 }); }
      else if (sh.ring) { var c2 = P(sh.ring); out.push({ t: 'ellipse', cx: c2[0], cy: c2[1], rx: sh.r * side, ry: sh.r * side, fill: '', stroke: col, lw: sh.sw * side }); }
    });
    return adv;
  }
  // Pone un texto que puede traer símbolos: el texto va como letra y cada símbolo como dibujo
  function pushText(out, s, x, y, f, size, color, cs, ctx) {
    cs = cs || 0;
    if (!SYM_TEST.test(s)) {
      out.push({ t: 'text', x: x, y: y, s: s, w: ctx.tw(s, f, size, cs), fam: f.fam, style: f.style, css: f.css, size: size, color: color, cs: cs });
      return;
    }
    var cx = x, sizeMM = size * PT;
    s.split(SYM_SPLIT).forEach(function (part) {
      if (!part) return;
      if (SYM[part]) { cx += drawSym(out, part, cx, y, sizeMM, color) + cs; return; }
      // los espacios de las orillas se miden y se saltan (así el PDF y el lienzo los cuentan igual)
      var w = ctx.tw(part, f, size, cs), core = part.trim();
      if (core) {
        var lead = part.slice(0, part.indexOf(core));
        out.push({ t: 'text', x: cx + (lead ? ctx.tw(lead, f, size, cs) + cs : 0), y: y, s: core, w: ctx.tw(core, f, size, cs), fam: f.fam, style: f.style, css: f.css, size: size, color: color, cs: cs });
      }
      cx += w + cs;
    });
  }

  function stdSafe(s) {
    var out = '', bad = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 0xFE0F || c === 0x200D) { out += s.charAt(i); continue; }
      if (c >= 0xD800 && c <= 0xDBFF) {
        var pair = s.substr(i, 2);
        if (SYM[pair]) { out += pair; i++; continue; }
        out += '?'; i++; bad = true; continue;
      }
      if (SYM[s.charAt(i)]) { out += s.charAt(i); continue; }
      if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252[c] || c === 10 || c === 13) out += s.charAt(i);
      else if (c === 9) out += ' ';
      else if (c === 0x2009 || c === 0x202F || c === 0x2002 || c === 0x2003) out += ' ';
      else { out += '?'; bad = true; }
    }
    return { s: out, bad: bad };
  }

  function getJsPDF(opts) {
    var J = (opts && opts.jsPDF) || (root && root.jspdf && root.jspdf.jsPDF) || (root && root.jsPDF);
    if (!J) throw new Error('PdfTemplate: falta jsPDF. Carga jspdf.umd.min.js (2.5.1) antes de pdf-template.js.');
    return J;
  }
  function famId(name) { return String(name || '').replace(/[^A-Za-z0-9_-]/g, '') || 'Fuente'; }
  var STYLES = ['normal', 'bold', 'italic', 'bolditalic'];
  function stripB64(s) { return String(s || '').replace(/^data:[^,]*,/, ''); }
  function registerFonts(doc, fonts, warnings) {
    var map = {};
    (fonts || []).forEach(function (f) {
      var fam = famId(f.family);
      STYLES.forEach(function (st) {
        if (!f[st]) return;
        try {
          var file = fam + '-' + st + '.ttf';
          doc.addFileToVFS(file, stripB64(f[st]));
          doc.addFont(file, fam, st);
          (map[fam] = map[fam] || {})[st] = true;
        } catch (e) { if (warnings) warnings.push('No se pudo cargar la fuente ' + fam + ' ' + st + ': ' + e.message); }
      });
    });
    return map;
  }
  function fontsKey(fonts) {
    return (fonts || []).map(function (f) { return famId(f.family) + ':' + STYLES.map(function (s) { return f[s] ? hashStr(f[s]) : '-'; }).join(','); }).join('|');
  }
  var measurers = {};
  function getMeasurer(tpl, opts) {
    var key = fontsKey(tpl.fonts);
    if (measurers[key]) return measurers[key];
    var J = getJsPDF(opts), doc = new J({ unit: 'mm', format: 'a4', compress: false });
    var warnings = [];
    var map = registerFonts(doc, tpl.fonts, warnings);
    var cache = new Map(), current = '';
    function unit(str, fam, style) {
      var k = fam + '|' + style + '|' + str, u = cache.get(k);
      if (u === undefined) {
        var fk = fam + '|' + style;
        if (fk !== current) { doc.setFont(fam, style); current = fk; }
        u = doc.getStringUnitWidth(str, { doKerning: false });   // el PDF se escribe sin kerning: se mide igual
        if (cache.size > 40000) cache.clear();
        cache.set(k, u);
      }
      return u;
    }
    return (measurers[key] = { unit: unit, fontMap: map, warnings: warnings });
  }
  function resolveFont(name, bold, italic, fontMap) {
    var want = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
    var n = String(name || 'helvetica').toLowerCase().trim();
    if (STD_FONTS[n]) return { fam: n, style: want, std: true, css: STD_FONTS[n].css };
    var fam = famId(name), have = fontMap[fam];
    if (!have && FONT_ALIAS[n]) { n = FONT_ALIAS[n]; return { fam: n, style: want, std: true, css: STD_FONTS[n].css }; }
    if (!have) return { fam: 'helvetica', style: want, std: true, css: STD_FONTS.helvetica.css, missing: name };
    var order = { bolditalic: ['bolditalic', 'bold', 'italic', 'normal'], bold: ['bold', 'normal'], italic: ['italic', 'normal'], normal: ['normal', 'bold', 'italic', 'bolditalic'] }[want];
    for (var i = 0; i < order.length; i++) if (have[order[i]]) return { fam: fam, style: order[i], std: false, css: '"TPDF-' + fam + '"' };
    return { fam: 'helvetica', style: want, std: true, css: STD_FONTS.helvetica.css };
  }

  /* ------------------------------------------------------------------ contexto de dibujo */

  function makeCtx(tpl, opts) {
    var m = getMeasurer(tpl, opts);
    var ctx = {
      tpl: tpl, opts: opts, loc: tpl.locale, m: m,
      warnings: m.warnings.slice(),
      images: opts.images || {},
      wanted: {},
      raw: !!opts.raw, design: !!opts.design,
      now: opts.now ? toDate(opts.now) : new Date(),
      qr: opts.qrcode || (root && root.qrcode) || null
    };
    ctx.font = function (name, bold, italic) {
      var f = resolveFont(name, bold, italic, m.fontMap);
      if (f.missing) warn({ ctx: ctx }, 'Fuente "' + f.missing + '" no cargada; se usa Helvetica.');
      return f;
    };
    ctx.clean = function (s, f) {
      s = String(s);
      // quita el selector de variante de emoji cuando no forma parte de un símbolo conocido
      if (s.indexOf('\uFE0F') >= 0) s = s.replace(/(.)\uFE0F/gu, function (m, ch) { return SYM[m] ? m : ch; });
      if (!f.std) return s;
      var r = stdSafe(s);
      if (r.bad) warn({ ctx: ctx }, 'Hay caracteres que las letras del PDF no tienen y salen como "?". Los símbolos ✓ ✗ ☐ ★ ⚠ → sí se dibujan (botón ✓); para otros alfabetos carga una fuente TTF.');
      return r.s;
    };
    ctx.tw = function (s, f, size, cs) {
      if (!SYM_TEST.test(s)) return m.unit(s, f.fam, f.style) * size * PT + (cs && s.length > 1 ? cs * (s.length - 1) : 0);
      var w = 0, n = 0;
      s.split(SYM_SPLIT).forEach(function (part) {
        if (!part) return;
        if (SYM[part]) { w += SYM[part].adv * size * PT; n += 1; }
        else { w += m.unit(part, f.fam, f.style) * size * PT; n += Array.from(part).length; }
      });
      return w + (cs && n > 1 ? cs * (n - 1) : 0);
    };
    ctx.image = function (src) {
      if (!src) return null;
      var info = ctx.images[src];
      if (!info) { ctx.wanted[src] = true; return null; }
      return info.error ? { error: true } : info;
    };
    ctx.src = function (src) {
      if (!src) return '';
      src = String(src);
      if (src.indexOf('asset:') === 0) return tpl.assets[src.slice(6)] || '';
      return src;
    };
    return ctx;
  }
  function mkScope(chain, vars, ctx) { return { chain: chain, vars: vars, loc: ctx.loc, ctx: ctx, raw: ctx.raw }; }
  function childScope(sc, obj, vars) {
    var v = {}, k;
    for (k in sc.vars) v[k] = sc.vars[k];
    for (k in vars) v[k] = vars[k];
    return { chain: [obj].concat(sc.chain), vars: v, loc: sc.loc, ctx: sc.ctx, raw: sc.raw };
  }

  /* ------------------------------------------------------------------ texto */

  // maxW puede ser un número o una función(índiceDeLínea) para anchos distintos por línea.
  function wrapText(text, maxW, meas) {
    var out = [], broken = false;
    var W = typeof maxW === 'function' ? function () { return Math.max(maxW(out.length), 0.5); } : (function (m) { return function () { return m; }; })(Math.max(maxW, 0.5));
    var paras = String(text).replace(/\r\n?/g, '\n').split('\n');
    for (var p = 0; p < paras.length; p++) {
      var para = paras[p];
      if (para.trim() === '') { out.push({ s: '', w: 0, end: true }); continue; }
      var words = para.split(/ +/), line = '', lw = 0;
      for (var i = 0; i < words.length; i++) {
        var wd = words[i];
        if (wd === '') continue;
        var test = line ? line + ' ' + wd : wd, tw = meas(test);
        if (tw <= W() + 1e-6) { line = test; lw = tw; continue; }
        if (line) { out.push({ s: line, w: lw, end: false }); line = ''; lw = 0; }
        var ww = meas(wd);
        if (ww <= W() + 1e-6) { line = wd; lw = ww; continue; }
        broken = true;
        var chars = Array.from(wd), chunk = '';
        for (var c = 0; c < chars.length; c++) {
          var t = chunk + chars[c];
          if (chunk && meas(t) > W() + 1e-6) { out.push({ s: chunk, w: meas(chunk), end: false }); chunk = chars[c]; }
          else chunk = t;
        }
        line = chunk; lw = meas(chunk);
      }
      out.push({ s: line, w: lw, end: true });
    }
    return { lines: out, broken: broken };
  }

  function fitLines(str, w, h, st, ctx) {
    var size = st.size, cs = st.cs || 0, res;
    var meas = function (s) { return ctx.tw(s, st.f, size, cs); };
    if (st.fit === 'shrink') {
      for (;;) {
        res = wrapText(str, w, meas);
        if ((res.lines.length * size * PT * st.lineHeight <= h + 0.01 && !res.broken) || size <= 4) break;
        size = Math.max(4, Math.round((size - 0.5) * 10) / 10);
      }
    } else if (st.fit === 'ellipsis') {
      var one = String(str).replace(/\s*\n\s*/g, ' '), ow = meas(one);
      if (ow > w + 1e-6) {
        var lo = 0, hi = one.length;
        while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (meas(one.slice(0, mid).replace(/\s+$/, '') + '…') <= w) lo = mid; else hi = mid - 1; }
        one = one.slice(0, lo).replace(/\s+$/, '') + '…';
        ow = meas(one);
      }
      res = { lines: [{ s: one, w: ow, end: true }] };
    } else res = wrapText(str, w, meas);
    return { lines: res.lines, size: size };
  }

  // Coloca líneas ya cortadas dentro de una caja. st: {f,size,color,align,valign,lineHeight,cs,underline,strike}
  function placeLines(out, lines, box, st, ctx) {
    var sizeMM = st.size * PT, lh = sizeMM * st.lineHeight, n = lines.length, bh = n * lh;
    var y0 = st.valign === 'middle' ? box.y + (box.h - bh) / 2 : st.valign === 'bottom' ? box.y + box.h - bh : box.y;
    var base0 = (lh - (ASC + DESC) * sizeMM) / 2 + ASC * sizeMM;
    for (var i = 0; i < n; i++) {
      var L = lines[i];
      if (!L.s) continue;
      var by = y0 + i * lh + base0, x0, x1;
      if (st.align === 'justify' && !L.end && L.s.indexOf(' ') > 0) {
        var words = L.s.split(' '), ws = words.map(function (wd) { return ctx.tw(wd, st.f, st.size, st.cs); });
        var gap = (box.w - ws.reduce(function (a, b) { return a + b; }, 0)) / (words.length - 1), x = box.x;
        for (var k = 0; k < words.length; k++) {
          pushText(out, words[k], x, by, st.f, st.size, st.color, st.cs, ctx);
          x += ws[k] + gap;
        }
        x0 = box.x; x1 = box.x + box.w;
      } else {
        x0 = st.align === 'center' ? box.x + (box.w - L.w) / 2 : st.align === 'right' ? box.x + box.w - L.w : box.x;
        x1 = x0 + L.w;
        pushText(out, L.s, x0, by, st.f, st.size, st.color, st.cs, ctx);
      }
      if (st.underline) out.push({ t: 'line', x1: x0, y1: by + sizeMM * 0.12, x2: x1, y2: by + sizeMM * 0.12, stroke: st.color, lw: Math.max(0.1, sizeMM * 0.06) });
      if (st.strike) out.push({ t: 'line', x1: x0, y1: by - sizeMM * 0.27, x2: x1, y2: by - sizeMM * 0.27, stroke: st.color, lw: Math.max(0.1, sizeMM * 0.06) });
    }
    return bh;
  }

  /* ------------------------------------------------------------------ texto con formato por partes
     <b>negrita</b> <i>cursiva</i> <u>subrayado</u> <s>tachado</s> <color=#c00>…</color> <size=14>…</size>
     <font=times>…</font> <bg=#fff3a0>resaltado</bg>. Lo de adentro de {{ }} no se toca. */
  var RICH_TAG = /<(\/?)(b|i|u|s|color|size|font|bg)(?:=([^>]*))?>/g;
  var RICH_TEST = /<\/?(b|i|u|s|color|size|font|bg)(=[^>]*)?>/;
  function hasRich(str) { return typeof str === 'string' && str.indexOf('<') >= 0 && RICH_TEST.test(str.replace(TOKEN_RE, '')); }
  function parseRich(str) {
    var runs = [], stack = [];
    function cur() { var st = {}; stack.forEach(function (e) { st[e.tag] = e.val; }); return st; }
    function push(t) {
      if (!t) return;
      var st = cur(), prev = runs[runs.length - 1];
      if (prev && JSON.stringify(prev.st) === JSON.stringify(st)) prev.t += t; else runs.push({ t: t, st: st });
    }
    String(str).split(/(\{\{[\s\S]+?\}\})/).forEach(function (part, pi) {
      if (pi % 2 === 1) { push(part); return; }
      var last = 0, m;
      RICH_TAG.lastIndex = 0;
      while ((m = RICH_TAG.exec(part))) {
        if (m.index > last) push(part.slice(last, m.index));
        if (m[1]) { for (var k = stack.length - 1; k >= 0; k--) if (stack[k].tag === m[2]) { stack.splice(k, 1); break; } }
        else stack.push({ tag: m[2], val: m[3] == null ? true : m[3].trim().replace(/^["']|["']$/g, '') });
        last = RICH_TAG.lastIndex;
      }
      if (last < part.length) push(part.slice(last));
    });
    return runs;
  }
  // Quita las marcas y deja el texto (para medir o describir)
  function stripRich(str) {
    return String(str).split(/(\{\{[\s\S]+?\}\})/).map(function (part, i) { return i % 2 ? part : part.replace(RICH_TAG, ''); }).join('');
  }

  // Acomoda y dibuja un texto con partes de distinto estilo dentro de la caja b
  function richText(out, el, scope, ctx, b, info) {
    var base = { font: el.font, bold: !!el.bold, italic: !!el.italic, size: num0(el.size, 10), color: el.color || '#000000', u: !!el.underline, s: !!el.strike };
    var cs = num0(el.letterSpacing, 0), lhK = num0(el.lineHeight, 1.2), fit = el.fit || 'wrap', align = el.align || 'left';
    var runs = parseRich(el.text).map(function (r) {
      var st = r.st;
      var f = ctx.font(st.font || base.font, st.b ? true : base.bold, st.i ? true : base.italic);
      return {
        f: f, size: st.size ? num0(st.size, base.size) : base.size, color: typeof st.color === 'string' ? st.color : base.color,
        u: !!st.u || base.u, s: !!st.s || base.s, bg: typeof st.bg === 'string' ? st.bg : '',
        t: ctx.clean(interpolate(r.t, scope), f).replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
      };
    });
    function seg(r, text, k) { var size = r.size * k; return { s: text, f: r.f, size: size, color: r.color, u: r.u, st: r.s, bg: r.bg, w: ctx.tw(text, r.f, size, cs) }; }
    // palabras (pueden mezclar estilos), espacios y saltos de línea
    function items(k, oneLine) {
      var list = [], cur = null;
      runs.forEach(function (r) {
        r.t.split(/(\n| +)/).forEach(function (piece) {
          if (!piece) return;
          if (piece === '\n' && !oneLine) { cur = null; list.push({ nl: true, size: r.size * k }); return; }
          if (piece === '\n' || /^ +$/.test(piece)) { cur = null; list.push({ sp: true, w: ctx.tw(' ', r.f, r.size * k, cs) + cs, run: r, k: k }); return; }
          var sg = seg(r, piece, k);
          if (cur) { cur.w += sg.w + cs; cur.segs.push(sg); } else { cur = { segs: [sg], w: sg.w }; list.push(cur); }
        });
      });
      return list;
    }
    // palabra más ancha que la caja: se corta letra por letra
    function splitWord(word, maxW) {
      var outW = [], curW = { segs: [], w: 0 };
      word.segs.forEach(function (sg) {
        var acc = '';
        Array.from(sg.s).forEach(function (ch) {
          var test = acc + ch, tw = ctx.tw(test, sg.f, sg.size, cs);
          if (curW.w + tw > maxW + 1e-6 && (acc || curW.segs.length)) {
            if (acc) { var p0 = Object.assign({}, sg, { s: acc, w: ctx.tw(acc, sg.f, sg.size, cs) }); curW.segs.push(p0); curW.w += p0.w; }
            outW.push(curW); curW = { segs: [], w: 0 }; acc = ch;
          } else acc = test;
        });
        if (acc) { var p1 = Object.assign({}, sg, { s: acc, w: ctx.tw(acc, sg.f, sg.size, cs) }); curW.segs.push(p1); curW.w += p1.w; }
      });
      if (curW.segs.length) outW.push(curW);
      return outW;
    }
    function wrap(k, maxW) {
      var lines = [], line, broken = false, pend = null;
      function newLine() { line = { parts: [], w: 0, size: 0, end: false }; lines.push(line); pend = null; }
      function place(word) {
        if (line.parts.length && pend) { line.parts.push(pend); line.w += pend.w; }
        pend = null;
        line.parts.push(word); line.w += word.w;
        word.segs.forEach(function (sg) { if (sg.size > line.size) line.size = sg.size; });
      }
      newLine();
      items(k, false).forEach(function (it) {
        if (it.nl) { line.end = true; if (!line.size) line.size = it.size; newLine(); return; }
        if (it.sp) { if (line.parts.length) pend = it; return; }
        if (line.parts.length && line.w + (pend ? pend.w : 0) + it.w > maxW + 1e-6) { line.end = false; newLine(); }
        if (!line.parts.length && it.w > maxW + 1e-6) {
          broken = true;
          var pieces = splitWord(it, maxW);
          pieces.forEach(function (pw, i) { if (i) newLine(); place(pw); });
          return;
        }
        place(it);
      });
      line.end = true;
      lines.forEach(function (l) { if (!l.size) l.size = base.size * k; });
      return { lines: lines, broken: broken };
    }
    function height(lines) { return lines.reduce(function (h, l) { return h + l.size * PT * lhK; }, 0); }
    var k = 1, res;
    if (fit === 'ellipsis') {
      // una sola línea: lo que no cabe se corta con "…"
      var flat = items(1, true), line1 = { parts: [], w: 0, size: 0, end: true }, full = false;
      for (var fi = 0; fi < flat.length && !full; fi++) {
        var it = flat[fi];
        if (it.sp) { if (line1.parts.length) { line1.parts.push(it); line1.w += it.w; } continue; }
        if (line1.w + it.w <= b.w + 1e-6) { line1.parts.push(it); line1.w += it.w; continue; }
        var segs = [], wsum = 0;
        for (var si = 0; si < it.segs.length; si++) {
          var sg = it.segs[si], ell = ctx.tw('…', sg.f, sg.size, cs), acc = '';
          var chars = Array.from(sg.s);
          for (var ci = 0; ci < chars.length; ci++) { if (line1.w + wsum + ctx.tw(acc + chars[ci], sg.f, sg.size, cs) + ell > b.w) break; acc += chars[ci]; }
          var cut = acc.length < sg.s.length;
          var piece = Object.assign({}, sg, { s: acc + (cut ? '…' : '') });
          piece.w = ctx.tw(piece.s, sg.f, sg.size, cs);
          segs.push(piece); wsum += piece.w;
          if (cut) break;
        }
        while (line1.parts.length && line1.parts[line1.parts.length - 1].sp) { line1.w -= line1.parts.pop().w; }
        if (segs.length) { line1.parts.push({ segs: segs, w: wsum }); line1.w += wsum; }
        full = true;
      }
      line1.parts.forEach(function (pt) { (pt.segs || []).forEach(function (sg2) { if (sg2.size > line1.size) line1.size = sg2.size; }); });
      if (!line1.size) line1.size = base.size;
      res = { lines: [line1] };
    } else if (fit === 'shrink') {
      for (;;) {
        res = wrap(k, b.w);
        if ((height(res.lines) <= b.h + 0.01 && !res.broken) || base.size * k <= 4) break;
        k = Math.max(4 / base.size, k - 0.04);
      }
    } else res = wrap(1, b.w);

    var total = height(res.lines);
    var y = el.valign === 'middle' ? b.y + (b.h - total) / 2 : el.valign === 'bottom' ? b.y + b.h - total : b.y;
    res.lines.forEach(function (L) {
      var sizeMM = L.size * PT, lh = sizeMM * lhK, base0 = y + (lh - (ASC + DESC) * sizeMM) / 2 + ASC * sizeMM;
      // sin espacios sueltos al final de la línea
      while (L.parts.length && L.parts[L.parts.length - 1].sp) L.w -= L.parts.pop().w;
      var nsp = L.parts.filter(function (pt) { return pt.sp; }).length;
      var extra = align === 'justify' && !L.end && nsp ? (b.w - L.w) / nsp : 0;
      var x = align === 'center' ? b.x + (b.w - L.w) / 2 : align === 'right' ? b.x + b.w - L.w : b.x;
      L.parts.forEach(function (pt, pi) {
        if (pt.sp) {
          var w = pt.w + extra, prev = L.parts[pi - 1], next = L.parts[pi + 1];
          var ps = prev && prev.segs && prev.segs[prev.segs.length - 1], ns = next && next.segs && next.segs[0];
          if (ps && ns && ps.u && ns.u) out.push({ t: 'line', x1: x, y1: base0 + ps.size * PT * 0.12, x2: x + w, y2: base0 + ps.size * PT * 0.12, stroke: ps.color, lw: Math.max(0.1, ps.size * PT * 0.06) });
          if (ps && ns && ps.bg && ps.bg === ns.bg) out.push({ t: 'rect', x: x, y: base0 - ASC * ps.size * PT - 0.3, w: w, h: (ASC + DESC) * ps.size * PT + 0.6, r: 0, fill: ps.bg });
          x += w;
          return;
        }
        pt.segs.forEach(function (sg) {
          var sm = sg.size * PT;
          if (sg.bg) out.push({ t: 'rect', x: x, y: base0 - ASC * sm - 0.3, w: sg.w + cs, h: (ASC + DESC) * sm + 0.6, r: 0, fill: sg.bg });
          pushText(out, sg.s, x, base0, sg.f, sg.size, sg.color, cs, ctx);
          if (sg.u) out.push({ t: 'line', x1: x, y1: base0 + sm * 0.12, x2: x + sg.w, y2: base0 + sm * 0.12, stroke: sg.color, lw: Math.max(0.1, sm * 0.06) });
          if (sg.st) out.push({ t: 'line', x1: x, y1: base0 - sm * 0.27, x2: x + sg.w, y2: base0 - sm * 0.27, stroke: sg.color, lw: Math.max(0.1, sm * 0.06) });
          x += sg.w + cs;
        });
      });
      y += lh;
    });
    if (ctx.design && total > b.h + 0.5 && fit === 'wrap') info.overflow = true;
    info.fontSize = base.size * k;
  }

  /* ------------------------------------------------------------------ elementos */

  var DASH = { dash: [2, 1.2], dot: [0.4, 0.8], longdash: [4, 2] };
  function dashOf(d, lw) {
    if (!d || !DASH[d]) return null;
    var k = Math.max(1, (lw || 0.3) / 0.3);
    return DASH[d].map(function (v) { return r3(v * (d === 'dot' ? k : 1)); });
  }
  function boxFill(out, el, x, y, w, h) {
    if (el.fill) out.push({ t: 'rect', x: x, y: y, w: w, h: h, r: num0(el.radius, 0), fill: el.fill });
  }
  function boxBorder(out, el, x, y, w, h) {
    var b = el.border || {}, bw = num0(b.width, 0), sides = b.sides == null ? 'tblr' : String(b.sides);
    if (bw <= 0 || !sides) return;
    var dash = dashOf(b.dash, bw), col = b.color || '#000000';
    if (/t/.test(sides) && /b/.test(sides) && /l/.test(sides) && /r/.test(sides)) {
      out.push({ t: 'rect', x: x, y: y, w: w, h: h, r: num0(el.radius, 0), stroke: col, lw: bw, dash: dash });
      return;
    }
    if (/t/.test(sides)) out.push({ t: 'line', x1: x, y1: y, x2: x + w, y2: y, stroke: col, lw: bw, dash: dash });
    if (/b/.test(sides)) out.push({ t: 'line', x1: x, y1: y + h, x2: x + w, y2: y + h, stroke: col, lw: bw, dash: dash });
    if (/l/.test(sides)) out.push({ t: 'line', x1: x, y1: y, x2: x, y2: y + h, stroke: col, lw: bw, dash: dash });
    if (/r/.test(sides)) out.push({ t: 'line', x1: x + w, y1: y, x2: x + w, y2: y + h, stroke: col, lw: bw, dash: dash });
  }
  function inner(el) {
    var p = num0(el.padding, 0);
    return { x: el.x + p, y: el.y + p, w: Math.max(0, el.w - 2 * p), h: Math.max(0, el.h - 2 * p) };
  }
  function textStyle(el, ctx, over) {
    var st = {
      f: ctx.font(el.font, el.bold, el.italic), size: num0(el.size, 10), color: el.color || '#000000',
      align: el.align || 'left', valign: el.valign || 'top', lineHeight: num0(el.lineHeight, 1.2),
      cs: num0(el.letterSpacing, 0), underline: !!el.underline, strike: !!el.strike, fit: el.fit || 'wrap'
    };
    if (over) for (var k in over) st[k] = over[k];
    return st;
  }
  function placeholder(out, x, y, w, h, label) { out.push({ t: 'ph', x: x, y: y, w: w, h: h, label: label || '' }); }

  function rotatePrims(prims, cx, cy, deg) {
    var a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    function R(x, y) { return [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]; }
    return prims.map(function (p) {
      var q = {}, k;
      for (k in p) q[k] = p[k];
      if (p.t === 'text') { var o = R(p.x, p.y); q.x = o[0]; q.y = o[1]; q.rot = deg; }
      else if (p.t === 'line') { var a1 = R(p.x1, p.y1), a2 = R(p.x2, p.y2); q.x1 = a1[0]; q.y1 = a1[1]; q.x2 = a2[0]; q.y2 = a2[1]; }
      else if (p.t === 'rect') {
        q = { t: 'poly', closed: true, pts: [R(p.x, p.y), R(p.x + p.w, p.y), R(p.x + p.w, p.y + p.h), R(p.x, p.y + p.h)], fill: p.fill, stroke: p.stroke, lw: p.lw, dash: p.dash, op: p.op };
      }
      else if (p.t === 'poly') q.pts = p.pts.map(function (pt) { return R(pt[0], pt[1]); });
      else if (p.t === 'ellipse') { var ce = R(p.cx, p.cy); q.cx = ce[0]; q.cy = ce[1]; }
      return q;
    });
  }

  function layoutElement(el, scope, ctx, out, info) {
    info = info || {};
    var start = out.length, b;
    switch (el.type) {
      case 'text': {
        boxFill(out, el, el.x, el.y, el.w, el.h);
        b = inner(el);
        if (hasRich(el.text)) {
          richText(out, el, scope, ctx, b, info);
          boxBorder(out, el, el.x, el.y, el.w, el.h);
          if (num0(el.rotate, 0)) {
            var rotR = rotatePrims(out.splice(start), el.x + el.w / 2, el.y + el.h / 2, num0(el.rotate, 0));
            for (var rr = 0; rr < rotR.length; rr++) out.push(rotR[rr]);
          }
          break;
        }
        var st = textStyle(el, ctx);
        var str = ctx.clean(interpolate(el.text, scope), st.f);
        var fl = fitLines(str, b.w, b.h, st, ctx);
        st.size = fl.size;
        var used = placeLines(out, fl.lines, b, st, ctx);
        if (ctx.design && used > b.h + 0.5 && st.fit === 'wrap') info.overflow = true;
        info.fontSize = fl.size;
        boxBorder(out, el, el.x, el.y, el.w, el.h);
        if (num0(el.rotate, 0)) {
          var rot = rotatePrims(out.splice(start), el.x + el.w / 2, el.y + el.h / 2, num0(el.rotate, 0));
          for (var r = 0; r < rot.length; r++) out.push(rot[r]);
        }
        break;
      }
      case 'field': {
        boxFill(out, el, el.x, el.y, el.w, el.h);
        b = inner(el);
        var rows = Math.max(1, Math.round(num0(el.rows, 1)));
        var fst = textStyle(el, ctx, { valign: 'top', lineHeight: 1 });
        var lst = textStyle(el, ctx, { f: ctx.font(el.font, el.labelBold, el.italic), color: el.labelColor || el.color, align: 'left', underline: false, strike: false });
        var label = ctx.clean(interpolate(el.label, scope), lst.f);
        var value = ctx.clean(interpolate(el.value, scope), fst.f);
        var ln = el.line || {}, lw = num0(ln.width, 0);
        var rowH = b.h / rows, sizeMM = fst.size * PT;
        var labelW = num0(el.labelWidth, 0) > 0 ? num0(el.labelWidth, 0) : label ? ctx.tw(label, lst.f, lst.size, lst.cs) + num0(el.gap, 2) : 0;
        var lineY = function (i) { return b.y + rowH * (i + 1) - lw / 2; };
        var baseY = function (i) { return lineY(i) - Math.max(0.6, Math.min(sizeMM * 0.32, rowH * 0.25)) - lw / 2; };
        if (label) {
          var lab = fitLines(label, Math.max(1, labelW - num0(el.gap, 2) * 0.5), 1e6, Object.assign({}, lst, { fit: 'ellipsis' }), ctx);
          pushText(out, lab.lines[0].s, b.x, baseY(0), lst.f, lst.size, lst.color, lst.cs, ctx);
        }
        var vx = b.x + labelW, vw = Math.max(1, b.w - labelW);
        if (value) {
          if (rows === 1) {
            var vst = Object.assign({}, fst, { fit: 'ellipsis' }), sz = fst.size;
            var vm = function (s) { return ctx.tw(s, fst.f, sz, fst.cs); };
            while (vm(value) > vw && sz > Math.max(5, fst.size * 0.7)) sz = Math.round((sz - 0.5) * 10) / 10;
            vst.size = sz;
            var vl = fitLines(value, vw, 1e6, vst, ctx).lines[0];
            var vx0 = fst.align === 'center' ? vx + (vw - vl.w) / 2 : fst.align === 'right' ? vx + vw - vl.w : vx + 0.5;
            pushText(out, vl.s, vx0, baseY(0), fst.f, sz, fst.color, fst.cs, ctx);
            if (fst.underline) out.push({ t: 'line', x1: vx0, y1: baseY(0) + sizeMM * 0.12, x2: vx0 + vl.w, y2: baseY(0) + sizeMM * 0.12, stroke: fst.color, lw: Math.max(0.1, sizeMM * 0.06) });
          } else {
            // primera fila junto a la etiqueta, las demás a todo el ancho
            var meas = function (s) { return ctx.tw(s, fst.f, fst.size, fst.cs); };
            var outLines = wrapText(value, function (k) { return k === 0 ? vw - 0.5 : b.w; }, meas).lines;
            for (var li = 0; li < Math.min(rows, outLines.length); li++) {
              var L = outLines[li], lx = li === 0 ? vx + 0.5 : b.x;
              if (L.s) pushText(out, L.s, lx, baseY(li), fst.f, fst.size, fst.color, fst.cs, ctx);
            }
            if (outLines.length > rows) info.overflow = true;
          }
        }
        if (lw > 0) {
          var dsh = dashOf(ln.dash, lw);
          for (var ri = 0; ri < rows; ri++) {
            out.push({ t: 'line', x1: ri === 0 ? vx : b.x, y1: lineY(ri), x2: b.x + b.w, y2: lineY(ri), stroke: ln.color || '#000000', lw: lw, dash: dsh });
          }
        }
        boxBorder(out, el, el.x, el.y, el.w, el.h);
        break;
      }
      case 'rect':
        boxFill(out, el, el.x, el.y, el.w, el.h);
        boxBorder(out, el, el.x, el.y, el.w, el.h);
        break;
      case 'ellipse': {
        var eb = el.border || {}, ebw = num0(eb.width, 0);
        out.push({ t: 'ellipse', cx: el.x + el.w / 2, cy: el.y + el.h / 2, rx: el.w / 2, ry: el.h / 2, fill: el.fill || '',
          stroke: ebw > 0 ? eb.color || '#000000' : '', lw: ebw, dash: dashOf(eb.dash, ebw) });
        break;
      }
      case 'line': {
        var lw2 = num0(el.width, 0.3);
        out.push({ t: 'line', x1: el.x, y1: el.flip ? el.y + el.h : el.y, x2: el.x + el.w, y2: el.flip ? el.y : el.y + el.h,
          stroke: el.color || '#000000', lw: lw2, dash: dashOf(el.dash, lw2), cap: el.cap || 'butt' });
        break;
      }
      case 'image': {
        boxFill(out, el, el.x, el.y, el.w, el.h);
        b = inner(el);
        var src = '', bound = !!(el.bind && String(el.bind).trim());
        if (bound && !ctx.raw) src = ctx.src(binding(el.bind, scope));
        else if (!bound) src = ctx.src(el.src);
        var im = src ? ctx.image(src) : null;
        if (!src || !im || im.error) {
          if (ctx.design) placeholder(out, b.x, b.y, b.w, b.h, bound ? String(el.bind).replace(/[{}]/g, '').trim() : im && im.error ? 'Imagen no disponible' : 'Imagen');
          if (im && im.error) warn(scope, 'No se pudo cargar una imagen' + (bound ? ' (' + el.bind + ')' : '') + '.');
        } else if (b.w > 0 && b.h > 0) {
          var iw = im.w, ih = im.h, fit = el.fit || 'contain';
          if (fit === 'cover') {
            var sc = Math.max(b.w / iw, b.h / ih), sw = b.w / sc, sh = b.h / sc;
            out.push({ t: 'image', src: src, x: b.x, y: b.y, w: b.w, h: b.h, iw: iw, ih: ih, crop: { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw: sw, sh: sh } });
          } else if (fit === 'stretch') {
            out.push({ t: 'image', src: src, x: b.x, y: b.y, w: b.w, h: b.h, iw: iw, ih: ih });
          } else {
            var s2 = Math.min(b.w / iw, b.h / ih), dw = iw * s2, dh = ih * s2;
            out.push({ t: 'image', src: src, x: b.x + (b.w - dw) / 2, y: b.y + (b.h - dh) / 2, w: dw, h: dh, iw: iw, ih: ih });
          }
        }
        boxBorder(out, el, el.x, el.y, el.w, el.h);
        break;
      }
      case 'checkbox': {
        boxFill(out, el, el.x, el.y, el.w, el.h);
        b = inner(el);
        var s = Math.max(1, num0(el.boxSize, 4)), bx = b.x, by = b.y + (b.h - s) / 2;
        var ck = el.checked;
        var checked = ck === true || (typeof ck === 'string' && ck.trim() !== '' &&
          (/^\s*(true|false)\s*$/.test(ck) ? ck.trim() === 'true' : !ctx.raw && truthy(binding(ck, scope))));
        out.push({ t: 'rect', x: bx, y: by, w: s, h: s, r: 0, fill: el.boxFill || '', stroke: el.boxColor || '#000000', lw: num0(el.boxWidth, 0.3) });
        if (checked) {
          var mc = el.color || '#000000';
          if (el.mark === 'x') {
            out.push({ t: 'line', x1: bx + s * 0.22, y1: by + s * 0.22, x2: bx + s * 0.78, y2: by + s * 0.78, stroke: mc, lw: Math.max(0.25, s * 0.1), cap: 'round' });
            out.push({ t: 'line', x1: bx + s * 0.78, y1: by + s * 0.22, x2: bx + s * 0.22, y2: by + s * 0.78, stroke: mc, lw: Math.max(0.25, s * 0.1), cap: 'round' });
          } else if (el.mark === 'fill') {
            out.push({ t: 'rect', x: bx + s * 0.22, y: by + s * 0.22, w: s * 0.56, h: s * 0.56, r: 0, fill: mc });
          } else {
            out.push({ t: 'poly', pts: [[bx + s * 0.2, by + s * 0.55], [bx + s * 0.42, by + s * 0.77], [bx + s * 0.82, by + s * 0.26]], closed: false, stroke: mc, lw: Math.max(0.3, s * 0.12), cap: 'round', join: 'round' });
          }
        }
        var cst = textStyle(el, ctx, { fit: 'ellipsis', valign: 'middle', align: 'left' });
        var ctext = ctx.clean(interpolate(el.label, scope), cst.f);
        if (ctext) {
          var cx0 = bx + s + num0(el.gap, 1.5), cw = Math.max(1, b.x + b.w - cx0);
          var cl = fitLines(ctext, cw, b.h, cst, ctx);
          cst.size = cl.size;
          placeLines(out, cl.lines, { x: cx0, y: by + s / 2 - 50, w: cw, h: 100 }, cst, ctx);
        }
        boxBorder(out, el, el.x, el.y, el.w, el.h);
        break;
      }
      case 'qr': {
        boxFill(out, el, el.x, el.y, el.w, el.h);
        b = inner(el);
        var qv = ctx.raw ? '' : interpolate(el.value, scope);
        var qsize = Math.min(b.w, b.h), qx = b.x + (b.w - qsize) / 2, qy = b.y + (b.h - qsize) / 2;
        var mods = qv ? qrModules(qv, el.level, ctx, scope) : null;
        if (!mods) { if (ctx.design) placeholder(out, qx, qy, qsize, qsize, ctx.raw ? 'QR' : qv ? 'QR (sin librería)' : 'QR vacío'); }
        else {
          var n = mods.length, ms = qsize / n, rects = [];
          for (var row = 0; row < n; row++) {
            var run = -1;
            for (var col = 0; col <= n; col++) {
              var dark = col < n && mods[row][col];
              if (dark && run < 0) run = col;
              if (!dark && run >= 0) { rects.push([r3(qx + run * ms), r3(qy + row * ms), r3((col - run) * ms), r3(ms)]); run = -1; }
            }
          }
          out.push({ t: 'rects', rects: rects, fill: el.color || '#000000' });
        }
        boxBorder(out, el, el.x, el.y, el.w, el.h);
        break;
      }
      case 'barcode': {
        boxFill(out, el, el.x, el.y, el.w, el.h);
        b = inner(el);
        var bv = ctx.raw ? '' : interpolate(el.value, scope);
        var widths = bv ? code128(bv) : null;
        var bst = textStyle(el, ctx, { align: 'center', valign: 'bottom', fit: 'ellipsis', underline: false, strike: false });
        var th = el.showText ? bst.size * PT * 1.15 + 0.4 : 0;
        if (!widths) {
          if (ctx.design) placeholder(out, b.x, b.y, b.w, b.h, ctx.raw ? 'Código de barras' : bv ? 'Carácter no válido para Code 128' : 'Código vacío');
          if (bv && !widths) warn(scope, 'Code 128 sólo acepta caracteres ASCII: "' + bv + '".');
        } else {
          var total = widths.reduce(function (a, c) { return a + c; }, 0), mw = b.w / total, bxx = b.x, brs = [];
          for (var wi = 0; wi < widths.length; wi++) {
            if (wi % 2 === 0 && widths[wi] > 0) brs.push([r3(bxx), r3(b.y), r3(widths[wi] * mw), r3(Math.max(1, b.h - th))]);
            bxx += widths[wi] * mw;
          }
          out.push({ t: 'rects', rects: brs, fill: el.color || '#000000' });
          if (el.showText) {
            var bl = fitLines(ctx.clean(bv, bst.f), b.w, th, bst, ctx);
            bst.size = bl.size;
            placeLines(out, bl.lines, { x: b.x, y: b.y + b.h - th, w: b.w, h: th }, bst, ctx);
          }
        }
        boxBorder(out, el, el.x, el.y, el.w, el.h);
        break;
      }
    }
    var op = num0(el.opacity, 1);
    if (op < 1) for (var oi = start; oi < out.length; oi++) out[oi].op = op;
    return info;
  }

  /* ------------------------------------------------------------------ tablas */

  function sourceValue(src, scope) {
    if (!src) return undefined;
    return binding(String(src).indexOf('{{') >= 0 ? src : '{{' + src + '}}', scope);
  }
  function measureTable(el, scope, ctx) {
    var cols = el.columns || [];
    if (!cols.length) return null;
    var tot = cols.reduce(function (a, c) { return a + Math.max(0.01, num0(c.width, 1)); }, 0);
    var ws = cols.map(function (c) { return el.w * Math.max(0.01, num0(c.width, 1)) / tot; });
    var pad = num0(el.padding, 1.5), lh = num0(el.lineHeight, 1.15), minH = num0(el.rowHeight, 6);
    var hd = el.header || {}, ft = el.footer || {};
    var fB = ctx.font(el.font, el.bold, el.italic), fH = ctx.font(el.font, hd.bold, el.italic), fF = ctx.font(el.font, ft.bold, el.italic);
    var sB = num0(el.size, 9), sH = num0(hd.size, 0) || sB;
    function cell(text, f, size, w, align, color) {
      text = ctx.clean(text, f);
      var meas = function (s) { return ctx.tw(s, f, size, 0); };
      var r = wrapText(text, w - 2 * pad, meas);
      return { lines: r.lines, f: f, size: size, align: align, color: color, h: r.lines.length * size * PT * lh + 2 * pad };
    }
    function row(kind, cells, index) {
      var own = kind === 'header' ? num0(hd.height, 0) : kind === 'footer' ? num0(ft.height, 0) : 0;
      var h = own > 0 ? own : minH;
      cells.forEach(function (c) { if (c.h > h) h = c.h; });
      return { kind: kind, cells: cells, h: h, index: index };
    }
    var M = { ws: ws, header: null, rows: [], footer: null, empty: null, placeholder: false };
    if (hd.show !== false) M.header = row('header', cols.map(function (c, i) { return cell(interpolate(c.header, scope), fH, sH, ws[i], c.align, hd.color || el.color); }));
    var arr = ctx.raw ? undefined : sourceValue(el.source, scope);
    if (Array.isArray(arr)) {
      arr.forEach(function (item, i) {
        var sc = childScope(scope, item, { _n: i + 1, _i: i });
        M.rows.push(row('body', cols.map(function (c, j) { return cell(interpolate(c.value, sc), fB, sB, ws[j], c.align, el.color); }), i));
      });
    } else if (ctx.design) {
      M.placeholder = true;
      for (var k = 0; k < 3; k++) M.rows.push(row('body', cols.map(function (c, j) { return cell(String(c.value || ''), fB, sB, ws[j], c.align, el.color); }), k));
    } else if (arr != null) {
      warn(scope, 'La tabla usa "' + el.source + '" pero ese dato no es una lista.');
    }
    if (ft.show) {
      var fsc = childScope(scope, {}, { _filas: Array.isArray(arr) ? arr : [], _rows: Array.isArray(arr) ? arr : [] });
      M.footer = row('footer', cols.map(function (c, i) { return cell(ctx.raw ? String(c.footer || '') : interpolate(c.footer, fsc), fF, sB, ws[i], c.align, ft.color || el.color); }));
    }
    if (!M.rows.length && el.emptyText) {
      var fe = ctx.font(el.font, false, true);
      M.empty = row('empty', [cell(interpolate(el.emptyText, scope), fe, sB, el.w, 'center', el.color)]);
    }
    M.pad = pad; M.lh = lh;
    return M;
  }
  function drawTable(out, el, M, rows, x, y, ctx, geo) {
    var hd = el.header || {}, ft = el.footer || {}, g = el.grid || {}, ys = [], cy = y;
    rows.forEach(function (r) {
      var fill = r.kind === 'header' ? hd.fill : r.kind === 'footer' ? ft.fill : el.zebra && r.index % 2 === 1 ? el.zebra : el.fill;
      if (fill) out.push({ t: 'rect', x: x, y: cy, w: el.w, h: r.h, r: 0, fill: fill });
      ys.push(cy); cy += r.h;
    });
    rows.forEach(function (r, ri) {
      var cx = x;
      r.cells.forEach(function (c, j) {
        var w = r.kind === 'empty' ? el.w : M.ws[j];
        var st = { f: c.f, size: c.size, color: c.color || '#000000', align: c.align || 'left', valign: el.valign || 'middle', lineHeight: M.lh, cs: 0 };
        placeLines(out, c.lines, { x: cx + M.pad, y: ys[ri] + M.pad, w: w - 2 * M.pad, h: r.h - 2 * M.pad }, st, ctx);
        cx += w;
      });
    });
    var gw = num0(g.width, 0), mode = g.mode || 'all', col = g.color || '#999999';
    if (gw > 0 && mode !== 'none' && rows.length) {
      var L = function (x1, y1, x2, y2) { out.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, stroke: col, lw: gw }); };
      if (mode === 'all' || mode === 'horizontal') {
        ys.forEach(function (yy) { L(x, yy, x + el.w, yy); });
        L(x, cy, x + el.w, cy);
      }
      if (mode === 'all') {
        rows.forEach(function (r, ri) {
          var bx = x;
          L(bx, ys[ri], bx, ys[ri] + r.h);
          if (r.kind !== 'empty') for (var j = 0; j < M.ws.length - 1; j++) { bx += M.ws[j]; L(bx, ys[ri], bx, ys[ri] + r.h); }
          L(x + el.w, ys[ri], x + el.w, ys[ri] + r.h);
        });
      }
      if (mode === 'outer') {
        out.push({ t: 'rect', x: x, y: y, w: el.w, h: cy - y, r: 0, stroke: col, lw: gw });
        if (rows[0].kind === 'header' && rows.length > 1) L(x, ys[1], x + el.w, ys[1]);
      }
    }
    if (geo) { geo.ys = ys; geo.end = cy; }
    return cy;
  }

  /* ------------------------------------------------------------------ páginas */

  function isVisible(el, scope, ctx) {
    if (!el.showIf || !String(el.showIf).trim() || ctx.raw) return true;
    return truthy(binding(el.showIf, scope));
  }
  function shifted(el, dy) {
    if (!dy) return el;
    var c = {}, k;
    for (k in el) c[k] = el[k];
    c.y = el.y + dy;
    return c;
  }
  function baseVars(ctx, extra) {
    var v = { _hoy: ctx.now, _today: ctx.now, _pagina: 1, _paginas: 1, _page: 1, _pages: 1 }, k;
    for (k in extra) v[k] = extra[k];
    return v;
  }

  /* encabezado y pie de página */
  function masterOn(tpl, dp, k) {
    var s = tpl.master.showOn;
    if (dp.noMaster || !tpl.master.elements.length || s === 'none') return false;
    return s === 'all' || (s === 'notFirst' && k > 0) || (s === 'first' && k === 0);
  }
  // Hasta dónde llega el encabezado (top) y desde dónde empieza el pie (bottom), en mm
  function masterGeom(tpl) {
    var g = { top: null, bottom: null }, half = tpl.page.height / 2;
    tpl.master.elements.forEach(function (e) {
      if (e.hidden) return;
      var y = num0(e.y, 0), h = num0(e.h, 0);
      if (y + h / 2 < half) g.top = Math.max(g.top == null ? -Infinity : g.top, y + h);
      else g.bottom = Math.min(g.bottom == null ? Infinity : g.bottom, y);
    });
    return g;
  }
  function masterItems(tpl, scope, ctx, design) {
    var items = [];
    tpl.master.elements.forEach(function (raw, z) {
      if (raw.hidden) return;
      var el = withDefaults(raw);
      el._z = z;
      if (!design && !isVisible(el, scope, ctx)) return;
      items.push(el.type === 'table' ? { el: el, table: true } : { el: el, dy: 0 });
    });
    return items;
  }

  function planPage(plan, tpl, dp, rec, ri, data, ctx) {
    var chain = rec !== undefined ? [rec, data] : [data];
    var scope = mkScope(chain, baseVars(ctx, { _registro: ri + 1, _record: ri + 1 }), ctx);
    var els = [];
    dp.elements.forEach(function (raw, z) {
      if (raw.hidden) return;
      var el = withDefaults(raw);
      el._z = z;
      if (isVisible(el, scope, ctx)) els.push(el);
    });
    var flow = els.filter(function (e) { return e.type === 'table' && e.paginate !== false; })
      .sort(function (a, b) { return a.y - b.y; })[0];
    var page = { pw: tpl.page.width, ph: tpl.page.height, chain: chain, ri: ri, dp: dp, items: [] };
    if (!flow) {
      els.forEach(function (e) {
        if (e.type === 'table') page.items.push({ el: e, table: true });
        else page.items.push({ el: e, dy: 0 });
      });
      plan.push(page);
      return;
    }
    var M = measureTable(flow, scope, ctx);
    var boxTop = flow.y, boxBottom = flow.y + flow.h;
    // Con encabezado y pie: en las hojas siguientes la tabla empieza bajo el encabezado y nunca pisa el pie
    var mg = masterGeom(tpl), withMaster = !dp.noMaster && tpl.master.elements.length > 0 && tpl.master.showOn !== 'none' && tpl.master.showOn !== 'first';
    var fillBottom = boxBottom;
    if (withMaster && mg.bottom != null && mg.bottom - 1 < boxBottom && mg.bottom - 1 > boxTop + 5) fillBottom = mg.bottom - 1;
    var explicitCont = flow.continueY != null && flow.continueY !== '' && isFinite(flow.continueY);
    var contTop = explicitCont ? Number(flow.continueY) : flow.y;
    if (!explicitCont && withMaster && mg.top != null && mg.top + 3 < fillBottom - 10) contTop = mg.top + 3;
    var hd = flow.header || {}, slices = [];
    if (M) {
      var n = M.rows.length, i = 0, first = true;
      do {
        var sl = { start: i, header: !!M.header && (first || hd.repeat !== false), y: first ? boxTop : contTop, footer: false, empty: false };
        var avail = fillBottom - sl.y, used = sl.header ? M.header.h : 0;
        while (i < n && used + M.rows[i].h <= avail + 0.001) { used += M.rows[i].h; i++; }
        if (i === sl.start && i < n) { used += M.rows[i].h; i++; }
        sl.end = i; sl.used = used;
        slices.push(sl);
        first = false;
      } while (i < n);
      var last = slices[slices.length - 1];
      if (M.empty) { last.empty = true; last.used += M.empty.h; }
      if (M.footer) {
        if (last.used + M.footer.h <= fillBottom - last.y + 0.001 || (last.start === last.end && !last.empty && !last.header)) { last.footer = true; last.used += M.footer.h; }
        else slices.push({ start: n, end: n, header: !!M.header && hd.repeat !== false, y: contTop, footer: true, empty: false,
          used: (M.header && hd.repeat !== false ? M.header.h : 0) + M.footer.h });
      }
    } else slices.push({ start: 0, end: 0, header: false, y: boxTop, used: 0 });

    var rep = [], before = [], after = [];
    els.forEach(function (e) {
      if (e === flow) return;
      if (e.repeat) rep.push(e);
      else if (e.y < boxBottom - 0.001) before.push(e);
      else after.push(e);
    });
    function tableItem(e) { return e.type === 'table' ? { el: e, table: true } : { el: e, dy: 0 }; }
    var pages = slices.map(function (sl, k) {
      var items = rep.map(tableItem);
      if (k === 0) items = items.concat(before.map(tableItem));
      if (M) items.push({ el: flow, slice: sl, M: M });
      return { pw: tpl.page.width, ph: tpl.page.height, chain: chain, ri: ri, dp: dp, items: items };
    });
    var lastSl = slices[slices.length - 1], tableEnd = lastSl.y + lastSl.used;
    if (after.length) {
      var follow = after.filter(function (e) { return e.follow; });
      var dy = tableEnd - boxBottom;
      var limit = tpl.page.height - num0(tpl.page.margins && tpl.page.margins.bottom, 0);
      // un pie que se repite (debajo de la tabla) también es límite: los totales no se le enciman
      rep.forEach(function (e) { if (e.y >= boxBottom - 0.001 && e.y < limit) limit = e.y; });
      if (withMaster && mg.bottom != null && mg.bottom < limit) limit = mg.bottom;
      var lowest = follow.reduce(function (m, e) { return Math.max(m, e.y + e.h + dy); }, -Infinity);
      var target = pages[pages.length - 1];
      if (follow.length && lowest > limit + 0.01) {
        target = { pw: tpl.page.width, ph: tpl.page.height, chain: chain, ri: ri, dp: dp, items: rep.map(tableItem) };
        pages.push(target);
        var topMost = follow.reduce(function (m, e) { return Math.min(m, e.y); }, Infinity);
        dy = contTop - topMost;
      }
      after.forEach(function (e) {
        if (e.type === 'table') target.items.push({ el: e.follow ? shifted(e, dy) : e, table: true });
        else target.items.push({ el: e, dy: e.follow ? dy : 0 });
      });
    }
    pages.forEach(function (p) {
      p.items.sort(function (a, b) { return a.el._z - b.el._z; });
      plan.push(p);
    });
  }

  function drawItems(items, scope, ctx, out, design, infos) {
    items.forEach(function (it) {
      var el = it.el, start = out.length, info = {};
      if (it.slice) {
        var sl = it.slice, M = it.M, rows = [];
        if (sl.header) rows.push(M.header);
        for (var r = sl.start; r < sl.end; r++) rows.push(M.rows[r]);
        if (sl.empty) rows.push(M.empty);
        if (sl.footer) rows.push(M.footer);
        drawTable(out, el, M, rows, el.x, sl.y, ctx);
      } else if (it.table) {
        var M2 = measureTable(el, scope, ctx);
        if (M2) {
          var rws = [], used = 0, more = 0;
          if (M2.header) { rws.push(M2.header); used += M2.header.h; }
          for (var i = 0; i < M2.rows.length; i++) {
            if (used + M2.rows[i].h <= el.h + 0.001 || (design && rws.length === 0)) { rws.push(M2.rows[i]); used += M2.rows[i].h; }
            else { more = M2.rows.length - i; break; }
          }
          if (M2.empty && used + M2.empty.h <= el.h + 0.5) { rws.push(M2.empty); used += M2.empty.h; }
          if (M2.footer && !more && (used + M2.footer.h <= el.h + 0.5 || design)) rws.push(M2.footer);
          var geo = {};
          drawTable(out, el, M2, rws, el.x, el.y, ctx, geo);
          info.ws = M2.ws;
          info.rows = rws.map(function (r, ri) { return { kind: r.kind, y: geo.ys[ri], h: r.h }; });
          info.more = more;
          info.placeholder = M2.placeholder;
        } else if (design) placeholder(out, el.x, el.y, el.w, el.h, 'Tabla sin columnas');
        var op = num0(el.opacity, 1);
        if (op < 1) for (var oi = start; oi < out.length; oi++) out[oi].op = op;
      } else {
        layoutElement(shifted(el, it.dy), scope, ctx, out, info);
      }
      if (infos) infos.push({ id: el.id, start: start, end: out.length, info: info });
    });
  }

  function layoutDocument(tplIn, data, opts) {
    opts = opts || {};
    var tpl = normalize(tplIn), ctx = makeCtx(tpl, opts);
    data = data || {};
    var plan = [];
    tpl.pages.forEach(function (dp) {
      var recs = [undefined];
      if (dp.repeatFor) {
        var arr = sourceValue(dp.repeatFor, mkScope([data], baseVars(ctx), ctx));
        if (Array.isArray(arr)) recs = arr;
        else { warn({ ctx: ctx }, '"' + dp.name + '" se repite por "' + dp.repeatFor + '", pero ese dato no es una lista.'); recs = []; }
      }
      recs.forEach(function (rec, ri) { planPage(plan, tpl, dp, rec, ri, data, ctx); });
    });
    var total = plan.length, pages = [];
    plan.forEach(function (pg, k) {
      var scope = mkScope(pg.chain, baseVars(ctx, { _pagina: k + 1, _paginas: total, _page: k + 1, _pages: total, _registro: pg.ri + 1, _record: pg.ri + 1 }), ctx);
      var out = [];
      if (masterOn(tpl, pg.dp, k)) drawItems(masterItems(tpl, scope, ctx, false), scope, ctx, out, false, null);
      drawItems(pg.items, scope, ctx, out, false, null);
      pages.push({ width: pg.pw, height: pg.ph, background: tpl.page.background, prims: out });
    });
    return { pages: pages, warnings: ctx.warnings, wanted: Object.keys(ctx.wanted), template: tpl };
  }

  // Vista del editor: una página de diseño tal cual, sin paginar, con información por elemento.
  // pageIndex = -1 es el encabezado y pie. "ghost" trae lo de la otra capa para verlo de fondo.
  function layoutDesign(tplIn, pageIndex, data, opts) {
    opts = Object.assign({}, opts || {}, { design: true });
    var tpl = normalize(tplIn), ctx = makeCtx(tpl, opts);
    var isMaster = pageIndex === -1;
    var dp = isMaster ? tpl.master : tpl.pages[pageIndex] || tpl.pages[0];
    data = data || {};
    function chainFor(page) {
      if (page.repeatFor && !ctx.raw) {
        var arr = sourceValue(page.repeatFor, mkScope([data], baseVars(ctx), ctx));
        if (Array.isArray(arr) && arr.length) return [arr[0], data];
      }
      return [data];
    }
    function designItems(list) {
      var its = [];
      list.forEach(function (raw, z) {
        if (raw.hidden) return;
        var el = withDefaults(raw);
        el._z = z;
        its.push(el.type === 'table' ? { el: el, table: true } : { el: el, dy: 0 });
      });
      return its;
    }
    var ref = isMaster ? tpl.pages.filter(function (p) { return !p.noMaster; })[0] || tpl.pages[0] : dp;
    var pi = isMaster ? 0 : (pageIndex || 0);
    var scope = mkScope(chainFor(ref), baseVars(ctx, { _pagina: pi + 1, _paginas: tpl.pages.length, _page: pi + 1, _pages: tpl.pages.length, _registro: 1, _record: 1 }), ctx);
    var out = [], infos = [], ghost = [];
    var items = designItems(dp.elements);
    if (isMaster) drawItems(designItems(ref.elements), scope, ctx, ghost, true, null);
    else if (masterOn(tpl, dp, pi === 0 ? 0 : 1)) drawItems(masterItems(tpl, scope, ctx, true), scope, ctx, ghost, true, null);
    drawItems(items, scope, ctx, out, true, infos);
    var res = infos.map(function (inf) {
      var el = items.filter(function (it) { return it.el.id === inf.id; })[0].el;
      inf.info.dim = !isVisible(el, scope, ctx);
      return { id: inf.id, prims: out.slice(inf.start, inf.end), info: inf.info };
    });
    return { width: tpl.page.width, height: tpl.page.height, background: tpl.page.background, items: res, ghost: ghost,
      warnings: ctx.warnings, wanted: Object.keys(ctx.wanted), template: tpl };
  }

  /* ------------------------------------------------------------------ QR y Code 128 */

  function qrModules(text, level, ctx, scope) {
    var Q = ctx.qr;
    if (!Q) { warn(scope, 'Para dibujar QR carga qrcode-generator 1.4.4 (window.qrcode).'); return null; }
    try {
      if (Q.stringToBytesFuncs && Q.stringToBytesFuncs['UTF-8'] && Q.stringToBytes !== Q.stringToBytesFuncs['UTF-8']) Q.stringToBytes = Q.stringToBytesFuncs['UTF-8'];
      var q = Q(0, /^[LMQH]$/.test(level) ? level : 'M');
      q.addData(String(text));
      q.make();
      var n = q.getModuleCount(), rows = [];
      for (var r = 0; r < n; r++) { var row = []; for (var c = 0; c < n; c++) row.push(q.isDark(r, c)); rows.push(row); }
      return rows;
    } catch (e) {
      warn(scope, 'QR: el texto es demasiado largo (' + String(text).length + ' caracteres).');
      return null;
    }
  }

  var C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
    '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
    '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
    '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
    '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
    '114131 311141 411131 211412 211214 211232 2331112').split(' ');
  function code128(s) {
    s = String(s);
    if (!s) return null;
    var codes = [], i;
    if (/^\d+$/.test(s) && s.length >= 4 && s.length % 2 === 0) {
      codes.push(105);
      for (i = 0; i < s.length; i += 2) codes.push(+s.substr(i, 2));
    } else {
      codes.push(104);
      for (i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c < 32 || c > 126) return null;
        codes.push(c - 32);
      }
    }
    var sum = codes[0];
    for (i = 1; i < codes.length; i++) sum += codes[i] * i;
    codes.push(sum % 103, 106);
    var widths = [];
    codes.forEach(function (cd) { C128[cd].split('').forEach(function (d) { widths.push(+d); }); });
    widths.unshift(10); widths.unshift(0);   // zona silenciosa a la izquierda (barra vacía de 0 + espacio de 10)
    widths.push(10);                          // y a la derecha
    return widths;
  }

  /* ------------------------------------------------------------------ salida SVG (editor y vistas previas) */

  function svgDash(d) { return d && d.length ? ' stroke-dasharray="' + d.join(' ') + '"' : ''; }
  function primsToSVG(prims, opts) {
    opts = opts || {};
    var href = opts.href || function (s) { return s; };
    var s = '';
    for (var i = 0; i < prims.length; i++) {
      var p = prims[i], op = p.op != null && p.op < 1 ? ' opacity="' + p.op + '"' : '';
      switch (p.t) {
        case 'rect':
          s += '<rect x="' + r3(p.x) + '" y="' + r3(p.y) + '" width="' + r3(Math.max(0, p.w)) + '" height="' + r3(Math.max(0, p.h)) + '"' +
            (p.r ? ' rx="' + r3(p.r) + '"' : '') + ' fill="' + (p.fill || 'none') + '"' +
            (p.stroke ? ' stroke="' + p.stroke + '" stroke-width="' + r3(p.lw) + '"' + svgDash(p.dash) : '') + op + '/>';
          break;
        case 'ellipse':
          s += '<ellipse cx="' + r3(p.cx) + '" cy="' + r3(p.cy) + '" rx="' + r3(p.rx) + '" ry="' + r3(p.ry) + '" fill="' + (p.fill || 'none') + '"' +
            (p.stroke ? ' stroke="' + p.stroke + '" stroke-width="' + r3(p.lw) + '"' + svgDash(p.dash) : '') + op + '/>';
          break;
        case 'line':
          s += '<line x1="' + r3(p.x1) + '" y1="' + r3(p.y1) + '" x2="' + r3(p.x2) + '" y2="' + r3(p.y2) + '" stroke="' + p.stroke + '" stroke-width="' + r3(p.lw) + '"' +
            (p.cap && p.cap !== 'butt' ? ' stroke-linecap="' + p.cap + '"' : '') + svgDash(p.dash) + op + '/>';
          break;
        case 'poly':
          s += '<' + (p.closed ? 'polygon' : 'polyline') + ' points="' + p.pts.map(function (q) { return r3(q[0]) + ',' + r3(q[1]); }).join(' ') + '" fill="' + (p.fill || 'none') + '"' +
            (p.stroke ? ' stroke="' + p.stroke + '" stroke-width="' + r3(p.lw) + '"' + (p.cap ? ' stroke-linecap="' + p.cap + '"' : '') + (p.join ? ' stroke-linejoin="' + p.join + '"' : '') + svgDash(p.dash) : '') + op + '/>';
          break;
        case 'rects':
          s += '<path fill="' + p.fill + '"' + op + ' d="' + p.rects.map(function (r) { return 'M' + r[0] + ' ' + r[1] + 'h' + r[2] + 'v' + r[3] + 'h' + (-r[2]) + 'z'; }).join('') + '"/>';
          break;
        case 'text': {
          var bold = /bold/.test(p.style), ital = /italic/.test(p.style);
          s += '<text x="' + r3(p.x) + '" y="' + r3(p.y) + '" font-family=\'' + p.css.replace(/'/g, '"') + '\' font-size="' + r3(p.size * PT) + '"' +
            (bold ? ' font-weight="bold"' : '') + (ital ? ' font-style="italic"' : '') + ' fill="' + p.color + '"' +
            (p.s.length > 1 && p.w > 0 ? ' textLength="' + r3(p.w) + '" lengthAdjust="spacingAndGlyphs"' : '') +
            (p.rot ? ' transform="rotate(' + r3(p.rot) + ' ' + r3(p.x) + ' ' + r3(p.y) + ')"' : '') + op + ' xml:space="preserve">' + esc(p.s) + '</text>';
          break;
        }
        case 'image':
          if (p.crop) {
            s += '<svg x="' + r3(p.x) + '" y="' + r3(p.y) + '" width="' + r3(p.w) + '" height="' + r3(p.h) + '" viewBox="' + r3(p.crop.sx) + ' ' + r3(p.crop.sy) + ' ' + r3(p.crop.sw) + ' ' + r3(p.crop.sh) + '" preserveAspectRatio="none"' + op + '>' +
              '<image href="' + esc(href(p.src)) + '" width="' + p.iw + '" height="' + p.ih + '" preserveAspectRatio="none"/></svg>';
          } else {
            s += '<image href="' + esc(href(p.src)) + '" x="' + r3(p.x) + '" y="' + r3(p.y) + '" width="' + r3(p.w) + '" height="' + r3(p.h) + '" preserveAspectRatio="none"' + op + '/>';
          }
          break;
        case 'ph':
          if (opts.placeholders === false) break;
          s += '<g class="tp-ph"><rect x="' + r3(p.x) + '" y="' + r3(p.y) + '" width="' + r3(Math.max(0, p.w)) + '" height="' + r3(Math.max(0, p.h)) + '" fill="#f1f3f5" stroke="#9aa3ad" stroke-width="0.25" stroke-dasharray="1 0.8"/>' +
            (p.label && p.w > 6 && p.h > 3 ? '<text x="' + r3(p.x + p.w / 2) + '" y="' + r3(p.y + p.h / 2 + 1) + '" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="' + r3(Math.min(3, p.h * 0.4, p.w / Math.max(4, p.label.length) * 1.6)) + '" fill="#6b7480">' + esc(p.label) + '</text>' : '') + '</g>';
          break;
      }
    }
    return s;
  }
  function pageToSVG(page, opts) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r3(page.width) + ' ' + r3(page.height) + '" width="' + r3(page.width) + 'mm" height="' + r3(page.height) + 'mm">' +
      '<rect width="' + r3(page.width) + '" height="' + r3(page.height) + '" fill="' + (page.background || '#ffffff') + '"/>' + primsToSVG(page.prims, opts) + '</svg>';
  }

  /* ------------------------------------------------------------------ salida PDF (jsPDF) */

  function cropImage(info, crop) {
    var maxPx = 2400, sw = crop.sw, sh = crop.sh, k = Math.min(1, maxPx / Math.max(sw, sh));
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
    var g = cv.getContext('2d');
    g.drawImage(info.img, crop.sx, crop.sy, sw, sh, 0, 0, cv.width, cv.height);
    var jpg = info.fmt === 'JPEG';
    return { data: cv.toDataURL(jpg ? 'image/jpeg' : 'image/png', 0.92), fmt: jpg ? 'JPEG' : 'PNG' };
  }

  function drawPDF(doc, p, images, cache) {
    var op = p.op != null && p.op < 1 && doc.GState;
    if (op) { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: p.op, 'stroke-opacity': p.op })); }
    var style;
    function stroke(c, lw, dash, cap) {
      var rgb = hexRGB(c); doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
      doc.setLineWidth(lw || 0.1);
      doc.setLineDashPattern(dash && dash.length ? dash : [], 0);
      doc.setLineCap(cap || 'butt');
    }
    function fill(c) { var rgb = hexRGB(c); doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
    switch (p.t) {
      case 'rect':
      case 'ellipse':
        style = p.fill && p.stroke ? 'FD' : p.fill ? 'F' : p.stroke ? 'S' : null;
        if (!style) break;
        if (p.fill) fill(p.fill);
        if (p.stroke) stroke(p.stroke, p.lw, p.dash);
        if (p.t === 'ellipse') doc.ellipse(p.cx, p.cy, p.rx, p.ry, style);
        else if (p.r > 0) doc.roundedRect(p.x, p.y, p.w, p.h, Math.min(p.r, p.w / 2, p.h / 2), Math.min(p.r, p.w / 2, p.h / 2), style);
        else doc.rect(p.x, p.y, p.w, p.h, style);
        break;
      case 'line':
        stroke(p.stroke, p.lw, p.dash, p.cap);
        doc.line(p.x1, p.y1, p.x2, p.y2, 'S');
        break;
      case 'poly': {
        style = p.fill && p.stroke ? 'FD' : p.fill ? 'F' : 'S';
        if (p.fill) fill(p.fill);
        if (p.stroke) { stroke(p.stroke, p.lw, p.dash, p.cap); doc.setLineJoin(p.join || 'miter'); }
        var d = [];
        for (var i = 1; i < p.pts.length; i++) d.push([p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]]);
        doc.lines(d, p.pts[0][0], p.pts[0][1], [1, 1], style, !!p.closed);
        if (p.stroke) doc.setLineJoin('miter');
        break;
      }
      case 'rects':
        fill(p.fill);
        for (var j = 0; j < p.rects.length; j++) doc.rect(p.rects[j][0], p.rects[j][1], p.rects[j][2], p.rects[j][3], 'F');
        break;
      case 'text': {
        var rgb = hexRGB(p.color);
        doc.setFont(p.fam, p.style);
        doc.setFontSize(p.size);
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);
        var o = { baseline: 'alphabetic' };
        if (p.cs) o.charSpace = p.cs;
        if (p.rot) o.angle = -p.rot;
        doc.text(p.s, p.x, p.y, o);
        break;
      }
      case 'image': {
        var info = images[p.src];
        if (!info || info.error) break;
        var key = p.src + (p.crop ? '|' + [p.crop.sx, p.crop.sy, p.crop.sw, p.crop.sh].map(r3).join(',') : '');
        var item = cache[key];
        if (!item) {
          item = p.crop && info.img ? cropImage(info, p.crop) : { data: info.data, fmt: info.fmt };
          item.alias = 'img_' + hashStr(key);
          cache[key] = item;
        }
        doc.addImage(item.data, item.fmt, p.x, p.y, p.w, p.h, item.alias, 'FAST');
        break;
      }
    }
    if (op) doc.restoreGraphicsState();
  }

  function toPDF(result, opts) {
    opts = opts || {};
    var J = getJsPDF(opts), tpl = result.template, pages = result.pages;
    var p0 = pages[0] || { width: tpl.page.width, height: tpl.page.height, prims: [] };
    var doc = new J({ unit: 'mm', format: [p0.width, p0.height], orientation: p0.width > p0.height ? 'landscape' : 'portrait', compress: true });
    registerFonts(doc, tpl.fonts, result.warnings);
    doc.setProperties({ title: opts.title || tpl.name, creator: 'Taller PDF ' + VERSION });
    var images = opts.images || {}, cache = {};
    (pages.length ? pages : [p0]).forEach(function (pg, i) {
      if (i > 0) doc.addPage([pg.width, pg.height], pg.width > pg.height ? 'landscape' : 'portrait');
      if (pg.background && !/^#?(fff|ffffff)$/i.test(pg.background)) {
        var c = hexRGB(pg.background); doc.setFillColor(c[0], c[1], c[2]); doc.rect(0, 0, pg.width, pg.height, 'F');
      }
      pg.prims.forEach(function (p) { drawPDF(doc, p, images, cache); });
    });
    return doc;
  }

  /* ------------------------------------------------------------------ imágenes */

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (typeof Image === 'undefined') { resolve({ error: true }); return; }
      var img = new Image();
      if (!/^data:/.test(src)) img.crossOrigin = 'anonymous';
      img.onload = function () {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var m = /^data:image\/(png|jpe?g)[;,]/i.exec(src), data = src, fmt;
        if (m) fmt = /png/i.test(m[1]) ? 'PNG' : 'JPEG';
        else {
          try {
            var cv = document.createElement('canvas'), k = Math.min(1, 3000 / Math.max(w, h, 1));
            cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            data = cv.toDataURL('image/png'); fmt = 'PNG';
          } catch (e) { resolve({ error: true }); return; }
        }
        resolve({ w: w, h: h, img: img, data: data, fmt: fmt });
      };
      img.onerror = function () { resolve({ error: true }); };
      img.src = src;
    });
  }
  function loadImages(srcs, into) {
    return Promise.all(srcs.map(function (s) {
      if (into[s]) return null;
      return loadImage(s).then(function (info) { into[s] = info; });
    })).then(function () { return into; });
  }

  /* ------------------------------------------------------------------ API */

  function render(tpl, data, opts) {
    opts = Object.assign({}, opts || {});
    var images = opts.images || (opts.images = {});
    var res = layoutDocument(tpl, data, opts);
    var go = res.wanted.length ? loadImages(res.wanted, images).then(function () { return layoutDocument(tpl, data, opts); }) : Promise.resolve(res);
    return go.then(function (r) {
      var doc = toPDF(r, opts);
      doc.templateWarnings = r.warnings;
      if (opts.onWarning) r.warnings.forEach(opts.onWarning);
      return doc;
    });
  }
  function save(tpl, data, filename, opts) {
    return render(tpl, data, opts).then(function (doc) { doc.save(filename || ((tpl && tpl.name) || 'documento') + '.pdf'); return doc; });
  }

  // Datos que usa la plantilla: { fields: [ruta...], lists: { lista: [campos...] }, repeat: [listas] }
  function variables(tplIn) {
    var tpl = normalize(tplIn), fields = {}, lists = {}, repeat = {};
    function pathsOf(ast, acc) {
      if (!ast) return;
      if (ast.k === 'path') { if (ast.p[0].charAt(0) !== '_' && ast.p[0] !== 'this' && ast.p[0] !== '$item') acc.push(ast.p.join('.')); }
      else if (ast.k === 'call') ast.args.forEach(function (a) { pathsOf(a, acc); });
      else ['a', 'b', 'c'].forEach(function (k) { if (ast[k]) pathsOf(ast[k], acc); });
    }
    function scan(str, onPath, onAgg) {
      if (str == null) return;
      String(str).replace(TOKEN_RE, function (m, e) {
        var c = compile(e.trim());
        if (c.error) return m;
        var acc = [];
        pathsOf(c.head, acc);
        c.filters.forEach(function (f) {
          f.args.forEach(function (a) { if (a.ast && a.ast.k !== 'path') pathsOf(a.ast, acc); });
          if (/^(sum|avg|min|max|join)$/.test(f.name) && c.head.k === 'path' && onAgg) {
            var fieldArg = f.name === 'join' ? f.args[1] : f.args[0];
            if (fieldArg && fieldArg.raw) onAgg(c.head.p.join('.'), fieldArg.raw);
          }
        });
        acc.forEach(onPath);
        return m;
      });
    }
    function addField(p) { fields[p] = true; }
    function addAgg(listPath, fieldExpr) {
      var acc = [], c = compile(fieldExpr);
      if (!c.error) pathsOf(c.head, acc);
      lists[listPath] = lists[listPath] || {};
      acc.forEach(function (f) { lists[listPath][f] = true; });
    }
    function bare(s) { return String(s || '').replace(/^\s*\{\{\s*|\s*\}\}\s*$/g, '').trim(); }
    tpl.pages.concat([{ repeatFor: '', elements: tpl.master.elements }]).forEach(function (dp) {
      var rf = bare(dp.repeatFor);
      if (rf) { repeat[rf] = true; lists[rf] = lists[rf] || {}; }
      dp.elements.forEach(function (el) {
        var onPath = rf ? function (p) { lists[rf][p] = true; } : addField;
        ['text', 'label', 'value', 'checked', 'bind'].forEach(function (k) {
          var v = el[k];
          if (k === 'checked' || k === 'bind') { if (v && String(v).indexOf('{{') < 0) v = '{{' + v + '}}'; }
          if (typeof v === 'string') scan(v, onPath, addAgg);
        });
        if (el.showIf) scan(String(el.showIf).indexOf('{{') < 0 ? '{{' + el.showIf + '}}' : el.showIf, onPath, addAgg);
        if (el.type === 'table') {
          var src = bare(el.source);
          if (src) {
            lists[src] = lists[src] || {};
            (el.columns || []).forEach(function (c) {
              scan(c.value, function (p) { lists[src][p] = true; }, addAgg);
              scan(c.header, onPath, addAgg);
              scan(c.footer, function (p) { if (p !== src) onPath(p); }, addAgg);
            });
          }
        }
      });
    });
    Object.keys(lists).forEach(function (l) { delete fields[l]; });
    Object.keys(fields).forEach(function (f) { if (lists[f.split('.')[0]]) delete fields[f]; });
    var outLists = {};
    Object.keys(lists).forEach(function (l) { outLists[l] = Object.keys(lists[l]); });
    return { fields: Object.keys(fields), lists: outLists, repeat: Object.keys(repeat) };
  }

  return {
    VERSION: VERSION,
    FORMAT: FORMAT,
    PT: PT,
    SIZES: SIZES,
    FONTS: STD_FONTS,
    FILTERS: Object.keys(FILTERS),
    render: render,
    save: save,
    layout: layoutDocument,
    layoutDesign: layoutDesign,
    toPDF: toPDF,
    toSVG: pageToSVG,
    primsToSVG: primsToSVG,
    loadImages: loadImages,
    normalize: normalize,
    withDefaults: withDefaults,
    defaults: function (type) { return deepMerge(baseFor(type), null); },
    interpolate: function (str, data, extra) {
      var tpl = normalize({});
      var ctx = { loc: tpl.locale, warnings: [] };
      return interpolate(str, { chain: [data || {}], vars: extra || {}, loc: tpl.locale, ctx: ctx });
    },
    evaluate: function (expr, data, extra, locale) {
      var loc = deepMerge(LOCALE, locale);
      return evaluate(expr, { chain: [data || {}], vars: extra || {}, loc: loc, ctx: { loc: loc, warnings: [] } });
    },
    compile: compile,
    variables: variables,
    code128: code128,
    parseRich: parseRich,
    stripRich: stripRich,
    hasRich: hasRich,
    // Símbolos que se dibujan solos (sin repetir los alias como ✔️ = ✔)
    symbols: function () {
      var seen = [];
      return Object.keys(SYM).filter(function (k) { if (seen.indexOf(SYM[k]) >= 0) return false; seen.push(SYM[k]); return true; })
        .map(function (k) { return { ch: k, name: SYM[k].name }; });
    },
    symbolSVG: function (ch, px, color) {
      if (!SYM[ch]) return '';
      var out = [], size = 10, sizeMM = size * PT, adv = SYM[ch].adv * sizeMM;
      drawSym(out, ch, 0, sizeMM * 0.86, sizeMM, color || '#141414');
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r3(adv) + ' ' + r3(sizeMM) + '" width="' + (px || 22) * SYM[ch].adv + '" height="' + (px || 22) + '">' + primsToSVG(out) + '</svg>';
    },
    formatDate: fmtDate,
    formatNumber: function (n, dec, locale) { return fmtNum(n, dec, deepMerge(LOCALE, locale)); }
  };
});
