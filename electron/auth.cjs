const fs = require("fs");

function readAuth(file) {
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    !value ||
    !["pin", "password"].includes(value.mode) ||
    typeof value.salt !== "string" ||
    !/^[a-f0-9]{48}$/.test(value.salt) ||
    typeof value.hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.hash)
  )
    throw new Error("잠금 파일의 검증값이 올바르지 않아요.");
  return value;
}

module.exports = { readAuth };
