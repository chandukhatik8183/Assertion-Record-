/* xlsx.js - tiny .xlsx / .csv reader and .xlsx writer.  Needs /vendor/fflate.min.js loaded first.
   XL.read(uint8, preferredSheetName) -> array of rows (array of strings)   [rows.d1904 = true if 1904 date system]
   XL.csv(text)                       -> array of rows
   XL.write({sheets:[{name,rows,widths,header,textCols,wrap,validations,freeze}]}) -> Uint8Array (.xlsx)  */
(function (root) {
  var F = root.fflate;

  function dec(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function (m, e) {
      if (e.charAt(0) === "#") {
        var c = e.charAt(1) === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(c); } catch (x) { return ""; }
      }
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e];
    }).replace(/_x([0-9A-Fa-f]{4})_/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  function xesc(s) {
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function attr(tag, n) {
    var m = new RegExp("(?:^|\\s)(?:\\w+:)?" + n + "=\"([^\"]*)\"").exec(tag);
    return m ? dec(m[1]) : null;
  }
  function colIdx(ref) {
    var m = /^([A-Za-z]+)/.exec(ref), s = m ? m[1].toUpperCase() : "A", n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }
  function colName(i) {
    var s = ""; i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
    return s;
  }
  function textOf(x) {
    x = x.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
    var out = "", re = /<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g, m;
    while ((m = re.exec(x))) out += m[1] ? dec(m[1]) : "";
    return out;
  }

  /* ---------------- READ .xlsx ---------------- */
  function read(u8, prefer) {
    var want = /^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^\/]+\.xml)$/;
    var z = F.unzipSync(u8, { filter: function (f) { return want.test(f.name) && f.originalSize < 80e6; } });
    if (!z["xl/workbook.xml"]) throw new Error("not a valid .xlsx file");
    var wb = F.strFromU8(z["xl/workbook.xml"]);
    var rels = z["xl/_rels/workbook.xml.rels"] ? F.strFromU8(z["xl/_rels/workbook.xml.rels"]) : "";
    var relMap = {}, m, re = /<(?:\w+:)?Relationship\b[^>]*>/g;
    while ((m = re.exec(rels))) { var id = attr(m[0], "Id"), tg = attr(m[0], "Target"); if (id && tg) relMap[id] = tg; }

    var sheets = [], rs = /<(?:\w+:)?sheet\b[^>]*>/g;
    while ((m = rs.exec(wb))) {
      var st = attr(m[0], "state");
      sheets.push({ name: attr(m[0], "name") || "", rid: attr(m[0], "id"), hidden: st === "hidden" || st === "veryHidden" });
    }
    if (!sheets.length) throw new Error("no sheets found");
    var pick = null;
    if (prefer) sheets.forEach(function (s) { if (!pick && s.name.toLowerCase() === prefer.toLowerCase()) pick = s; });
    if (!pick) sheets.forEach(function (s) { if (!pick && !s.hidden) pick = s; });
    if (!pick) pick = sheets[0];
    var target = relMap[pick.rid] || "worksheets/sheet1.xml";
    target = target.replace(/^\//, "");
    if (target.indexOf("xl/") !== 0) target = "xl/" + target;
    if (!z[target]) throw new Error("sheet data missing");

    var ss = [];
    if (z["xl/sharedStrings.xml"]) {
      var sx = F.strFromU8(z["xl/sharedStrings.xml"]), rsi = /<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g;
      while ((m = rsi.exec(sx))) ss.push(m[1] ? textOf(m[1]) : "");
    }

    var xml = F.strFromU8(z[target]), rows = [], maxC = 0, seq = 0;
    var rc = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
    while ((m = rc.exec(xml))) {
      var a = m[1], inner = m[2] || "", ref = attr(a, "r"), t = attr(a, "t"), v = "", r, c;
      if (ref) { r = parseInt(ref.replace(/[^0-9]/g, ""), 10) - 1; c = colIdx(ref); }
      else { r = 0; c = seq++; }
      if (!(r >= 0) || r > 50000) continue;
      if (t === "inlineStr") v = textOf(inner);
      else {
        var vm = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
        v = vm ? dec(vm[1]) : "";
        if (t === "s") v = ss[parseInt(v, 10)] || "";
        else if (t === "b") v = v === "1" ? "TRUE" : "FALSE";
        else if (t === "e") v = "";
      }
      if (v === "") continue;
      if (!rows[r]) rows[r] = [];
      rows[r][c] = v;
      if (c + 1 > maxC) maxC = c + 1;
    }
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var src = rows[i] || [], row = [];
      for (var j = 0; j < maxC; j++) row.push(src[j] == null ? "" : String(src[j]));
      out.push(row);
    }
    out.d1904 = /<(?:\w+:)?workbookPr\b[^>]*date1904="(?:1|true)"/.test(wb);
    return out;
  }

  /* ---------------- READ csv ---------------- */
  function csv(text) {
    text = String(text).replace(/^\ufeff/, "");
    var first = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, ""), best = ",", bc = -1;
    [",", ";", "\t"].forEach(function (d) { var c = first.split(d).length - 1; if (c > bc) { bc = c; best = d; } });
    var rows = [], row = [], cur = "", q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);
      if (q) {
        if (ch === '"') { if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === best) { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text.charAt(i + 1) === "\n") i++;
        row.push(cur); cur = ""; rows.push(row); row = [];
      } else cur += ch;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* ---------------- WRITE .xlsx ---------------- */
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function sheetXml(sh) {
    var rows = sh.rows || [], nc = 0, i, j;
    rows.forEach(function (r) { if (r.length > nc) nc = r.length; });
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    x += '<dimension ref="A1:' + colName(Math.max(nc, 1) - 1) + Math.max(rows.length, 1) + '"/>';
    x += '<sheetViews><sheetView workbookViewId="0">' + (sh.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '') + '</sheetView></sheetViews>';
    x += '<sheetFormatPr defaultRowHeight="15"/>';
    var dataStyle = sh.wrap ? 3 : (sh.textCols ? 2 : 0);
    x += '<cols>';
    for (j = 0; j < nc; j++) {
      var w = (sh.widths && sh.widths[j]) || 16;
      x += '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w + '" customWidth="1"' + (dataStyle ? ' style="' + dataStyle + '"' : '') + '/>';
    }
    x += '</cols><sheetData>';
    for (i = 0; i < rows.length; i++) {
      x += '<row r="' + (i + 1) + '"' + (i === 0 && sh.header ? ' ht="32" customHeight="1"' : '') + '>';
      for (j = 0; j < rows[i].length; j++) {
        var v = rows[i][j], isH = i === 0 && sh.header, s = isH ? 1 : dataStyle;
        if (v == null || v === "") { if (isH) x += '<c r="' + colName(j) + (i + 1) + '" s="1"/>'; continue; }
        x += '<c r="' + colName(j) + (i + 1) + '"' + (s ? ' s="' + s + '"' : '') + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(v) + '</t></is></c>';
      }
      x += '</row>';
    }
    x += '</sheetData>';
    if (sh.header && nc) x += '<autoFilter ref="A1:' + colName(nc - 1) + Math.max(rows.length, 1) + '"/>';
    var vals = (sh.validations || []).filter(function (v) { return v.formula || v.list.join(",").length <= 250; });
    if (vals.length) {
      var last = sh.validationRows || 2000;
      x += '<dataValidations count="' + vals.length + '">';
      vals.forEach(function (v) {
        var c = colName(v.col);
        x += '<dataValidation type="list" allowBlank="1" showErrorMessage="1"' + (v.warn ? ' errorStyle="warning"' : '') + ' errorTitle="Check value" error="' + xesc(v.msg || "Please pick a value from the list.") + '" sqref="' + c + '2:' + c + last + '"><formula1>' + (v.formula ? xesc(v.formula) : '"' + xesc(v.list.join(",")) + '"') + '</formula1></dataValidation>';
      });
      x += '</dataValidations>';
    }
    x += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    return x;
  }

  function write(book) {
    var sh = book.sheets, files = {}, n = sh.length, i;
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    var wbx = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    var wr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    for (i = 0; i < n; i++) {
      var nm = String(sh[i].name || "Sheet" + (i + 1)).replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31);
      ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wbx += '<sheet name="' + xesc(nm) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      wr += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      files["xl/worksheets/sheet" + (i + 1) + ".xml"] = F.strToU8(sheetXml(sh[i]));
    }
    wr += '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    files["[Content_Types].xml"] = F.strToU8(ct + '</Types>');
    files["_rels/.rels"] = F.strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    var nm = (book.names || []).map(function (q) { return '<definedName name="' + xesc(q.name) + '">' + xesc(q.ref) + '</definedName>'; }).join('');
    files["xl/workbook.xml"] = F.strToU8(wbx + '</sheets>' + (nm ? '<definedNames>' + nm + '</definedNames>' : '') + '</workbook>');
    files["xl/_rels/workbook.xml.rels"] = F.strToU8(wr);
    files["xl/styles.xml"] = F.strToU8(STYLES);
    return F.zipSync(files, { level: 6 });
  }

  root.XL = { read: read, csv: csv, write: write };
})(typeof self !== "undefined" ? self : globalThis);
