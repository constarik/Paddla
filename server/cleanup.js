const admin = require('firebase-admin');
const sa = require('C:\\Users\\const\\Downloads\\Code\\holepuncher-constr-firebase-adminsdk-fbsvc-a5c94b33ee.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
db.collection('paddla_games').where('nickname','==','MotherFucker').get()
  .then(snap => {
    console.log('Found:', snap.size);
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    return batch.commit();
  })
  .then(() => { console.log('Done'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
