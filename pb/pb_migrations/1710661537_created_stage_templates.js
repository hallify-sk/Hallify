/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "5yw1wmo1kh08q5p",
    "created": "2024-03-17 07:45:37.506Z",
    "updated": "2024-03-17 07:45:37.506Z",
    "name": "stage_templates",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "qlmpnd7l",
        "name": "stage",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 2000000
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
  const collection = dao.findCollectionByNameOrId("5yw1wmo1kh08q5p");

  return dao.deleteCollection(collection);
})
