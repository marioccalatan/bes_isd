import oracledb from 'oracledb';

export async function resourcePersonsRequest(connection, method, id, profile, body) {
  const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
  if (id && !(await connection.execute("SELECT ID FROM BES_TRAIN_RESOURCE_PERSONS WHERE ID=:id AND IS_ACTIVE='Y'", { id })).rows.length) fail('Resource person not found.', 404);
  if (profile) {
    if (method !== 'GET' || !id) fail('Invalid request.');
    const row = (await connection.execute('SELECT PROFILE_NAME, PROFILE_BLOB FROM BES_TRAIN_RESOURCE_PERSONS WHERE ID=:id', { id })).rows[0];
    if (!row.PROFILE_BLOB) fail('No short profile attached.', 404);
    const buffer = Buffer.isBuffer(row.PROFILE_BLOB) ? row.PROFILE_BLOB : await row.PROFILE_BLOB.getData();
    return { name: row.PROFILE_NAME, base64: buffer.toString('base64') };
  }
  if (method === 'DELETE') {
    if (!id) fail('Resource person required.');
    await connection.execute("UPDATE BES_TRAIN_RESOURCE_PERSONS SET IS_ACTIVE='N', UPDATED_AT=SYSTIMESTAMP WHERE ID=:id", { id });
  } else if (['POST', 'PUT'].includes(method)) {
    if (method === 'PUT' && !id || method === 'POST' && id) fail('Invalid request.');
    const limits = { lastName: 150, firstName: 150, middleName: 150, company: 500, specializations: 2000, email: 320, contactNumber: 100, affiliation: 1000 };
    const values = {};
    for (const [key, limit] of Object.entries(limits)) {
      if (body[key] != null && typeof body[key] !== 'string') fail(`Invalid ${key}.`);
      const value = (body[key] ?? '').trim();
      if (Buffer.byteLength(value, 'utf8') > limit) fail(`${key} exceeds ${limit} bytes.`);
      values[key] = value || null;
    }
    if (!values.lastName || !values.firstName) fail('Last name and first name are required.');
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fail('Enter a valid email address.');
    values.fullName = `${values.lastName}, ${[values.firstName, values.middleName].filter(Boolean).join(' ')}`;
    let attachment;
    if (body.profile !== undefined) {
      attachment = { name: null, blob: null };
      if (body.profile !== null) {
        const { name, base64 } = body.profile;
        if (typeof name !== 'string' || !name.trim() || Buffer.byteLength(name) > 255 || /[\x00-\x1f\\/]/.test(name) || !/\.(pdf|docx?|txt|png|jpe?g)$/i.test(name)) fail('Use a PDF, Word, text, PNG, or JPEG short profile.');
        if (typeof base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) fail('Invalid profile attachment.');
        const blob = Buffer.from(base64, 'base64');
        if (!blob.length || blob.length > 5 * 1024 * 1024) fail('Short profile must be between 1 byte and 5 MB.');
        attachment = { name, blob };
      }
    }
    if (id) {
      await connection.execute(`UPDATE BES_TRAIN_RESOURCE_PERSONS SET LAST_NAME=:lastName, FIRST_NAME=:firstName,
        MIDDLE_NAME=:middleName, FULL_NAME=:fullName, COMPANY=:company, SPECIALIZATIONS=:specializations,
        EMAIL=:email, CONTACT_NUMBER=:contactNumber, AFFILIATION=:affiliation, UPDATED_AT=SYSTIMESTAMP WHERE ID=:id`, { ...values, id });
    } else {
      const inserted = await connection.execute(`INSERT INTO BES_TRAIN_RESOURCE_PERSONS
        (LAST_NAME,FIRST_NAME,MIDDLE_NAME,FULL_NAME,COMPANY,SPECIALIZATIONS,EMAIL,CONTACT_NUMBER,AFFILIATION)
        VALUES (:lastName,:firstName,:middleName,:fullName,:company,:specializations,:email,:contactNumber,:affiliation)
        RETURNING ID INTO :newId`, { ...values, newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      id = inserted.outBinds.newId[0];
    }
    if (attachment !== undefined) await connection.execute('UPDATE BES_TRAIN_RESOURCE_PERSONS SET PROFILE_NAME=:name, PROFILE_BLOB=:blob WHERE ID=:id', { id, name: attachment.name, blob: { val: attachment.blob, type: oracledb.BLOB } });
  } else if (method !== 'GET') fail('Invalid request.');
  const rows = (await connection.execute(`SELECT ID,LAST_NAME,FIRST_NAME,MIDDLE_NAME,FULL_NAME,COMPANY,SPECIALIZATIONS,
    EMAIL,CONTACT_NUMBER,AFFILIATION,PROFILE_NAME FROM BES_TRAIN_RESOURCE_PERSONS WHERE IS_ACTIVE='Y' ORDER BY UPPER(FULL_NAME),ID`)).rows;
  if (method !== 'GET') await connection.commit();
  return { people: rows.map((row) => ({ id: String(row.ID), lastName: row.LAST_NAME, firstName: row.FIRST_NAME,
    middleName: row.MIDDLE_NAME ?? '', fullName: row.FULL_NAME, company: row.COMPANY ?? '', specializations: row.SPECIALIZATIONS ?? '',
    email: row.EMAIL ?? '', contactNumber: row.CONTACT_NUMBER ?? '', affiliation: row.AFFILIATION ?? '', profileName: row.PROFILE_NAME })) };
}
