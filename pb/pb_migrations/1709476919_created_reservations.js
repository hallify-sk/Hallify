/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "ekg9mkrbjwgfj08",
    "created": "2024-03-03 14:41:59.959Z",
    "updated": "2024-03-03 14:41:59.959Z",
    "name": "reservations",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "nsh3tw9j",
        "name": "user",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "_pb_users_auth_",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "6btbabnw",
        "name": "pocet_hosti",
        "type": "number",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 0,
          "max": 120,
          "noDecimal": true
        }
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("ekg9mkrbjwgfj08");

  return dao.deleteCollection(collection);
})
