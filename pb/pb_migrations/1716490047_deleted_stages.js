/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("1tyx58slhet80bx");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "1tyx58slhet80bx",
    "created": "2024-01-09 12:14:38.617Z",
    "updated": "2024-05-01 19:40:56.163Z",
    "name": "stages",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "zkyykjld",
        "name": "stage",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 2000000
        }
      },
      {
        "system": false,
        "id": "ibcixlzi",
        "name": "tables",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 2000000
        }
      },
      {
        "system": false,
        "id": "c2pw3mmi",
        "name": "render",
        "type": "file",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "mimeTypes": [],
          "thumbs": [],
          "maxSelect": 1,
          "maxSize": 50000000,
          "protected": false
        }
      },
      {
        "system": false,
        "id": "o4smd0yz",
        "name": "categories",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "hgj9brjypc8a3h3",
          "cascadeDelete": false,
          "minSelect": null,
          "maxSelect": null,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "vdnp2dn3",
        "name": "name",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      }
    ],
    "indexes": [
      "CREATE INDEX `idx_woSWG6S` ON `stages` (`created`)"
    ],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
})
