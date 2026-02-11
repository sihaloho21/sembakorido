# GAS v6.1 Patch: `upsert_setting`

Patch ini menambah action `upsert_setting` agar sheet `settings` di-update in-place berdasarkan kolom `key` (bukan append baris baru).

## 1) Tambahkan handler di `doPost`

Tempatkan sebelum generic CRUD:

```javascript
if (action === 'upsert_setting') {
  return jsonOutput(handleUpsertSetting(data));
}
```

## 2) Tambahkan helper function

```javascript
function handleUpsertSetting(data) {
  if (!data) {
    return { success: false, error: 'data required' };
  }

  const key = String(data.key || '').trim();
  const value = String(data.value ?? '');
  if (!key) {
    return { success: false, error: 'key required' };
  }

  const sheet = getSheet('settings');
  const values = sheet.getDataRange().getValues();
  if (!values || values.length === 0) {
    return { success: false, error: 'settings sheet has no header' };
  }

  const headers = values[0];
  const keyIdx = headers.indexOf('key');
  const valueIdx = headers.indexOf('value');
  if (keyIdx === -1 || valueIdx === -1) {
    return { success: false, error: 'settings header must contain key,value' };
  }

  // Cari baris key terakhir (last-write-wins)
  let targetRow = -1;
  for (let i = values.length - 1; i >= 1; i -= 1) {
    if (String(values[i][keyIdx] || '').trim() === key) {
      targetRow = i + 1; // sheet row number
      break;
    }
  }

  if (targetRow === -1) {
    // key belum ada -> append
    const row = headers.map((h) => {
      if (h === 'key') return key;
      if (h === 'value') return value;
      return '';
    });
    sheet.appendRow(row);
    return { success: true, mode: 'create', key: key, value: value };
  }

  // key sudah ada -> update kolom value
  sheet.getRange(targetRow, valueIdx + 1).setValue(value);
  return { success: true, mode: 'update', key: key, value: value, row: targetRow };
}
```

## 3) Verifikasi cepat

Panggil endpoint:

```json
{
  "action": "upsert_setting",
  "sheet": "settings",
  "data": {
    "key": "referral_reward_referrer",
    "value": "20"
  }
}
```

Expected:
- `success: true`
- `mode: create` saat key belum ada
- `mode: update` saat key sudah ada
