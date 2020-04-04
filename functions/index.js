'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const express = require('express');
const cors = require('cors')({origin: true});
const app = express();

app.use(cors);
let db = admin.firestore();

// curl -X POST -H "Content-Type:application/json" http://localhost:5001/elder-telemed/us-central1/createEncounter -d '{"data": {"encounterId": "myencounter4", "encounter": {"patient":"mypatient"}}}'
exports.createEncounter = functions.https.onRequest((request, response) => {
    return cors(request, response, () => {
        console.log("createEncounter: " + JSON.stringify(request.body.data, null, 2))
        var encounterId = request.body.data.encounterId;
        var encounter = request.body.data.encounter;

        if (!encounter.patient || 0 === encounter.patient.length) {
            response.status(400).send("No patient specified.");
            return;
        }
        // Check patient exists and rewrite it as a firebase reference
        db.collection('patients').doc(encounter.patient).get()
        .then(doc => {
            console.log("Check Patient: " + doc.exists + " " + JSON.stringify(doc.data()))
            if (!doc.exists) {
                console.log("Rejecting!");
                return Promise.reject({code: 400, msg:"Patient doesn't exist: " + encounter.patient});
            } else {
                encounter.patient = db.doc('patients/' + encounter.patient);
            }
        }).then(() => {
            let ref = db.collection('encounters').doc(encounterId);
            let transaction = db.runTransaction(t => {
                return t.get(ref)
                    .then(doc => {
                        if (doc.exists) {
                            return Promise.reject({code: 409, msg:"Encounter ID already exists: " + encounterId});
                        } else {
                            t.set(ref, encounter);
                            return Promise.resolve("Saved");
                        }
                    });
            }).then(result => {
                console.log('Transaction success!');
                response.status(200).send({data:'ok'});
            }).catch(err => {
                console.log('Transaction failure:', err.msg?err.msg:err);
                if (err.code) {
                    response.status(err.code).send(err.msg);
                } else {
                    response.status(500).send();
                }
            });
        }).catch(err => {
            response.status(err.code).send(err.msg);
            return;
        });
    });
});

// Rewrite encounter to replace all references with actual patient Ids which
// can be returned through the API.
function rewriteEncounterReferences(encounter) {
    var outEncounter = Object.assign(encounter);
    if (encounter.patient) {
        outEncounter.patient = encounter.patient.id;
    }
    return outEncounter;
}

exports.getEncounter = functions.https.onRequest((request, response) => {
    var encounterId = request.body.data.id;
    return cors(request, response, () => {
        let ref = db.collection('encounters').doc(encounterId);
        ref.get().then(doc => {
            if (!doc.exists) {
                console.log('No such document!');
                response.status(404);
              } else {
                console.log('Document data:', doc.data());
                response.status(200).send(rewriteEncounterReferences(doc.data()));
              }
            })
            .catch(err => {
              console.log('Error getting document', err);
            });
    });
});

// TODO(tstanis): paging.  userId where clause.
// curl -X POST -H "Content-Type:application/json" http://localhost:5001/elder-telemed/us-central1/listEncounters -d '{"data": {"userId": "tstanis"}}'
exports.listEncounters = functions.https.onRequest((request, response) => {
    return cors(request, response, () => {
        var userId = request.body.data.userId;
        let encountersRef = db.collection('encounters');
        let allEncounters = encountersRef.get()
            .then(encounters => {
                var returnEncounters = []
                encounters.forEach(doc => {
                    console.log(doc.id, '=>', doc.data());
                    returnEncounters.push({'encounterId' : doc.id, 'encounter': rewriteEncounterReferences(doc.data())});
                });
                response.status(200).send({'data':returnEncounters});
            })
            .catch(err => {
                console.log('Error getting documents', err);
                response.status(500).send();
            });
    });
});

// curl -X POST -H "Content-Type:application/json" http://localhost:5001/elder-telemed/us-central1/queryEncounters -d '{"data": {"patientId": "mypatient"}}'
exports.queryEncounters = functions.https.onRequest((request, response) => {
    return cors(request, response, () => {
        var patientId = request.body.data.patientId;
        console.log("Query(patiendId=" + patientId + ")")
        let encountersRef = db.collection('encounters');
        let patientRef = db.collection('patients').doc(patientId);
        let query = encountersRef.where('patient', '==', patientRef).get()
            .then(encounters => {
                var returnEncounters = []
                encounters.forEach(doc => {
                    console.log(doc.id, '=>', doc.data());
                    returnEncounters.push({'encounterId' : doc.id, 'encounter': rewriteEncounterReferences(doc.data())});
                });
                response.status(200).send({'data':returnEncounters});
            })
            .catch(err => {
                console.log('Error getting encounters', err);
                response.status(500).send();
            });
    });
});

// curl -X POST -H "Content-Type:application/json" http://localhost:5001/elder-telemed/us-central1/createPatient -d '{"data": {"patientEmail": "mypatient", "patient":{"name": "foo bar"}}}'
exports.createPatient = functions.https.onRequest((request, response) => {
    return cors(request, response, () => {
        console.log("createPatient: " + JSON.stringify(request.body.data, null, 2))
        var patientEmail = request.body.data.patientEmail;
        var patient = request.body.data.patient;
        let ref = db.collection('patients').doc(patientEmail);
        db.runTransaction(t => {
            return t.get(ref)
                .then(doc => {
                    if (doc.exists) {
                        return Promise.reject({code: 409, msg:"Patient already exists: " + patientEmail});
                    } else {
                        t.set(ref, patient);
                        return Promise.resolve("Saved");
                    }
                });
        }).then(result => {
            //ref.collection('webrtc_signal_queue').doc('queue').set({});
            console.log('Transaction success!');
            response.status(200).send({data:'ok'});
        }).catch(err => {
            console.log('Transaction failure:', err.msg?err.msg:err);
            if (err.code) {
                response.status(err.code).send(err.msg);
            } else {
                response.status(500).send();
            }
        });
    });
});

// curl -X POST -H "Content-Type:application/json" http://localhost:5001/elder-telemed/us-central1/listPatients -d '{"data": {"userId": "tstanis"}}'
exports.listPatients = functions.https.onRequest((request, response) => {
    return cors(request, response, () => {
        var userId = request.body.data.userId;
        let encountersRef = db.collection('patients');
        let allPatients = encountersRef.get()
            .then(patients => {
                var returnPatients = []
                patients.forEach(doc => {
                    console.log(doc.id, '=>', doc.data());
                    returnPatients.push({'patientEmail' : doc.id, 'patient': doc.data()});
                });
                response.status(200).send({'data':returnPatients});
            })
            .catch(err => {
                console.log('Error getting documents', err);
                response.status(500).send();
            });
    });
});

const msgdb = admin.database();

exports.sendMessage = functions.https.onRequest((request, response) => {
    return cors(request, response, () => {
        console.log("Saving: " + JSON.stringify(request.body.data, null, 2));
        var requesterId = request.body.data.id;
        var encounterId = request.body.data.encounterId;
        var sequenceNumber = request.body.data.seqNum;
        var ref = msgdb.ref("messages/" + encounterId);
        ref.transaction(function (current_value) {
            console.log("Current Value: " + JSON.stringify(current_value, null, 2))
            if (current_value == null) {
                current_value = {'queue': []}
            }
            console.log("Write to " + requesterId);
            var inserted = false;
            for (var i = 0 ; i < current_value.queue.length; ++i) {
                if (current_value.queue[i].id == requesterId && 
                    current_value.queue[i].seqNum > sequenceNumber) {
                    current_value.queue.splice(i, 0, request.body.data)
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                current_value.queue.push(request.body.data);
            }
            return current_value;
        });
        response.status(200).send({'data': {'text':"Hello from Firebase!"}});
    });
});

exports.readMessage = functions.https.onRequest((request, response) => {
    
    return cors(request, response, () => {
        var requesterId = request.body.data.id;
        var encounterId = request.body.data.encounterId;
        console.log("Read from " + requesterId + " of " + encounterId);
        var ref = msgdb.ref("messages/" + encounterId);
        var returnVal = null;
        ref.transaction(function(data) {
            console.log("Loaded: " + JSON.stringify(data, null, 2));
            if (data == null || !data.queue || data.queue.length == 0) {
                return data;
            }
            console.log("Old Queue Length " + data.queue.length);
            console.log("RequesterId: " + requesterId);
            for(var i = 0; i < data.queue.length; ++i) {
                if (data.queue[i].id == requesterId) {
                    console.log("Skipping my own ID " + requesterId );
                    continue;
                } else {
                    console.log("Removing " + JSON.stringify(data.queue[i], null, 2));
                    returnVal = data.queue[i];
                    data.queue.splice(i, 1);
                    break;
                }
            }
            console.log("New Queue Length " + data.queue.length);
            return data;
        }).then(() => {
            console.log("Returning: " + JSON.stringify(returnVal, null, 2));
            response.status(200).send({'data': returnVal});
        });
    });
});


exports.sendMessageFirestore = functions.https.onRequest((request, response) => {
    return cors(request, response, () => {
        console.log("Saving: " + JSON.stringify(request.body.data, null, 2));
        var requesterId = request.body.data.id;
        var encounterId = request.body.data.encounterId;
        console.log("EncounterID: " + encounterId + " RequestionId: " + requesterId);
        let ref = db.collection('encounters').doc(encounterId).collection('webrtc_signal_queue').doc(requesterId.toString());
        let transaction = db.runTransaction(t => {
            return t.get(ref)
                .then(doc => {
                    console.log("sendMessage success get");
                    if (!doc.exists) {
                        console.log("sendMessage no doc");
                        data = {'queue':[request.body.data]};
                        t.set(ref, data);
                    } else {
                        console.log("Current Value: " + JSON.stringify(doc.data(), null, 2));
                        var data = doc.data()
                        data['queue'].push(request.body.data);
                        t.update(ref, data);
                    }
                    return Promise.resolve("ok");
                });
        }).then(result => {
            console.log('Transaction success!');
            response.status(200).send({'data': {'text':"Hello from Firebase!"}});
        }).catch(err => {
            console.log('Transaction failure:', err);
            response.status(500).send();
        });
    });
});

exports.readMessageFirestore = functions.https.onRequest((request, response) => {
    return cors(request, response, () => {
        var requesterId = request.body.data.id;
        var encounterId = request.body.data.encounterId;
        console.log("ReadMessage EncounterID: " + encounterId + " RequestionId: " + requesterId);
        let ref = db.collection('encounters').doc(encounterId).collection('webrtc_signal_queue').doc(requesterId.toString());
        db.runTransaction(t => {
            t.get(ref).then(doc => {
                console.log("Get success");
                if (!doc.exists) {
                    console.log("Doc doesn't exist");
                    Promise.resolve(null);
                }
                data = doc.data();
                console.log("Loaded: " + JSON.stringify(data, null, 2));
                if (data == null || !data.queue || data.queue.length == 0) {
                    return Promise.resolve(null);
                }
                console.log("Old Queue Length " + data.queue.length);
                console.log("RequesterId: " + requesterId);
                var returnVal = null;
                for(var i = 0; i < data.queue.length; ++i) {
                    if (data.queue[i].id == requesterId) {
                        console.log("Skipping my own ID " + requesterId );
                        continue;
                    } else {
                        console.log("Removing " + JSON.stringify(data.queue[i], null, 2));
                        returnVal = data.queue[i];
                        data.queue.splice(i, 1);
                    }
                }
                console.log("New Queue Length " + data.queue.length);
                t.set(ref, data);
                return Promise.resolve(returnVal);
            });
        }).then(result => {
            if (result == null) {
                console.log("Return null");
                response.status(200).send(null);
            } else {
                console.log("Returning: " + JSON.stringify(result, null, 2));
                response.status(200).send({'data': result});
            }
        }).catch(err => {
            console.log("Error " + JSON.stringify(err, null, 2));
            response.status(500).send();
        });
    });
});
