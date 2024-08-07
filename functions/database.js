import { MongoClient, ObjectId } from "mongodb";

export async function readFromDatabase(id) {
  const client = new MongoClient(
    `mongodb://${encodeURIComponent(
      process.env.MONGODB_USERNAME
    )}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${
      process.env.MONGODB_SERVER
    }`
  );

  try {
    const database = client.db(process.env.MONGODB_DATABASE);
    const collection = database.collection(process.env.MONGODB_COLLECTION);
    const result = await collection.findOne({ _id: new ObjectId(id) });

    return result;
  } finally {
    await client.close();
  }
}

export async function saveToDatabase(data) {
  const client = new MongoClient(
    `mongodb://${encodeURIComponent(
      process.env.MONGODB_USERNAME
    )}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${
      process.env.MONGODB_SERVER
    }`
  );

  try {
    const database = client.db(process.env.MONGODB_DATABASE);
    const collection = database.collection(process.env.MONGODB_COLLECTION);
    const result = await collection.insertOne(data);

    return result.insertedId;
  } finally {
    await client.close();
  }
}

export async function setItemStatusesByItemId(sessionId, itemIds, status) {
  const client = new MongoClient(
    `mongodb://${encodeURIComponent(
      process.env.MONGODB_USERNAME
    )}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${
      process.env.MONGODB_SERVER
    }`
  );

  let itemsFilter = [];

  if (typeof itemIds === "object") {
    for (const itemId of itemIds) {
      itemsFilter.push({ "match.id": itemId });
    }
  } else {
    itemsFilter.push({ "match.id": itemIds });
  }

  let setStatus = {};

  for (const key in status) {
    setStatus[[`parsed.line_items.$[match].${key}`]] = status[key];
  }

  try {
    const database = client.db(process.env.MONGODB_DATABASE);
    const collection = database.collection(process.env.MONGODB_COLLECTION);
    const result = await collection.updateOne(
      { _id: new ObjectId(sessionId) },
      { $set: setStatus },
      { arrayFilters: [{ $or: itemsFilter }] }
    );

    return result;
  } catch (err) {
    console.log(err.stack);
  } finally {
    await client.close();
  }
}

export async function clearItemsCheckedBySocketId(sessionId, socketId) {
  const client = new MongoClient(
    `mongodb://${encodeURIComponent(
      process.env.MONGODB_USERNAME
    )}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${
      process.env.MONGODB_SERVER
    }`
  );

  try {
    const database = client.db(process.env.MONGODB_DATABASE);
    const collection = database.collection(process.env.MONGODB_COLLECTION);
    const result = await collection.updateOne(
      { _id: new ObjectId(sessionId) },
      { $pull: { "parsed.line_items.$[match].checkedBy": socketId } },
      { arrayFilters: [{ $or: [{ "match.checkedBy": { $in: [socketId] } }] }] }
    );

    return result;
  } catch (err) {
    console.log(err.stack);
  } finally {
    await client.close();
  }
}

export async function cleanUpAllCheckedBy(sessionId, sessionMembersData) {
  const receiptData = await readFromDatabase(sessionId);

  if (receiptData && receiptData.parsed && receiptData.parsed.line_items) {
    receiptData.parsed.line_items.map((item) => {
      item.checkedBy.map((socketId) => {
        if (!sessionMembersData.some((member) => member.id === socketId)) {
          clearItemsCheckedBySocketId(sessionId, socketId);
        }
      });
    });
  }
}

export async function setInitiatorData(data) {
  const sessionId = data.sessionId;
  const client = new MongoClient(
    `mongodb://${encodeURIComponent(
      process.env.MONGODB_USERNAME
    )}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${
      process.env.MONGODB_SERVER
    }`
  );

  try {
    const database = client.db(process.env.MONGODB_DATABASE);
    const collection = database.collection(process.env.MONGODB_COLLECTION);
    const result = await collection.updateOne(
      { _id: new ObjectId(sessionId) },
      {
        $set: {
          "initiator.cashTag": data.cashTag,
          "initiator.venmoHandle": data.venmoHandle,
          "initiator.humanName": data.humanName,
        },
      }
    );
  } catch (err) {
    console.log(err.stack);
  } finally {
    await client.close();
  }
}

export async function setTipAmount(data) {
  const sessionId = data.sessionId;
  const client = new MongoClient(
    `mongodb://${encodeURIComponent(
      process.env.MONGODB_USERNAME
    )}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${
      process.env.MONGODB_SERVER
    }`
  );

  try {
    const database = client.db(process.env.MONGODB_DATABASE);
    const collection = database.collection(process.env.MONGODB_COLLECTION);
    const result = await collection.updateOne(
      { _id: new ObjectId(sessionId) },
      {
        $set: {
          "parsed.tip": data.tip,
          isManualTipAmount: true,
        },
      }
    );
  } catch (err) {
    console.log(err.stack);
  } finally {
    await client.close();
  }
}
