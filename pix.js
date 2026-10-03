(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PixSticker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var WISE_SEND = "https://wise.com/transferFlow";

  function crc16(text) {
    var crc = 0xffff;
    for (var i = 0; i < text.length; i++) {
      crc ^= text.charCodeAt(i) << 8;
      for (var bit = 0; bit < 8; bit++) {
        if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
        else crc = (crc << 1) & 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  function parseFields(text) {
    var fields = {};
    var i = 0;
    while (i + 4 <= text.length) {
      var id = text.slice(i, i + 2);
      var len = parseInt(text.slice(i + 2, i + 4), 10);
      if (!/^\d{2}$/.test(id) || !Number.isFinite(len) || len < 0 || i + 4 + len > text.length) {
        return null;
      }
      fields[id] = text.slice(i + 4, i + 4 + len);
      i += 4 + len;
    }
    if (i !== text.length) return null;
    return fields;
  }

  function formatCnpj(digits) {
    return (
      digits.slice(0, 2) +
      "." +
      digits.slice(2, 5) +
      "." +
      digits.slice(5, 8) +
      "/" +
      digits.slice(8, 12) +
      "-" +
      digits.slice(12)
    );
  }

  function cnpjDigitsOk(digits) {
    if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
    function digit(base) {
      var sum = 0;
      var pos = base.length - 7;
      for (var i = 0; i < base.length; i++) {
        sum += Number(base[i]) * pos;
        pos -= 1;
        if (pos < 2) pos = 9;
      }
      var mod = sum % 11;
      return mod < 2 ? 0 : 11 - mod;
    }
    var first = digit(digits.slice(0, 12));
    var second = digit(digits.slice(0, 12) + String(first));
    return digits.endsWith(String(first) + String(second));
  }

  function keyType(key) {
    if (/^\d{14}$/.test(key)) return "cnpj";
    if (/^\d{11}$/.test(key)) return "cpf";
    if (/^\+[1-9]\d{1,14}$/.test(key)) return "phone";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return "email";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "random";
    return "other";
  }

  function formatAmount(raw) {
    if (!raw) return null;
    var parts = raw.split(".");
    var whole = parts[0] || "0";
    var cents = (parts[1] || "00").padEnd(2, "0").slice(0, 2);
    return "R$ " + whole + "," + cents;
  }

  function fail(error) {
    return { ok: false, error: error, wiseUrl: WISE_SEND };
  }

  function parsePixPayload(payload) {
    var text = String(payload || "").replace(/[\r\n\t]/g, "").trim();
    if (!text.startsWith("000201")) return fail("This is not a Pix sticker.");
    if (!/6304[0-9A-Fa-f]{4}$/.test(text)) return fail("This sticker is incomplete. Scan it again.");
    var given = text.slice(-4).toUpperCase();
    var signed = text.slice(0, -4);
    if (crc16(signed) !== given) return fail("This sticker did not read cleanly. Scan it again.");

    var fields = parseFields(text);
    if (!fields) return fail("This sticker did not read cleanly. Scan it again.");

    var pix = null;
    for (var id = 26; id <= 51; id++) {
      var raw = fields[String(id).padStart(2, "0")];
      if (!raw) continue;
      var nested = parseFields(raw);
      if (nested && nested["00"] === "br.gov.bcb.pix") {
        pix = nested;
        break;
      }
    }
    if (!pix) return fail("This code has no Pix key.");

    var name = fields["59"] || null;
    var city = fields["60"] || null;
    var amount = formatAmount(fields["54"] || null);

    if (pix["25"] && !pix["01"]) {
      return {
        ok: true,
        kind: "dynamic",
        key: null,
        keyType: null,
        cnpjDigits: null,
        cnpjFormatted: null,
        name: name,
        city: city,
        amount: amount,
        copyText: null,
        wiseUrl: WISE_SEND,
      };
    }

    var key = pix["01"] || null;
    if (!key) return fail("This sticker has no Pix key.");
    var type = keyType(key);
    var digits = type === "cnpj" ? key : null;
    return {
      ok: true,
      kind: "static",
      key: key,
      keyType: type,
      cnpjDigits: digits,
      cnpjFormatted: digits ? formatCnpj(digits) : null,
      cnpjCheck: digits ? cnpjDigitsOk(digits) : null,
      name: name,
      city: city,
      amount: amount,
      copyText: digits || key,
      wiseUrl: WISE_SEND,
    };
  }

  return {
    WISE_SEND: WISE_SEND,
    crc16: crc16,
    parsePixPayload: parsePixPayload,
    cnpjDigitsOk: cnpjDigitsOk,
    formatCnpj: formatCnpj,
  };
});
