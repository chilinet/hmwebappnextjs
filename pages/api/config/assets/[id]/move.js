import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import sql from "mssql";
import { getConnection } from "../../../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "PUT") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const { id } = req.query;
  const { newParentId } = req.body;

  if (!id || !newParentId) {
    return res.status(400).json({ message: "Asset ID and new parent ID are required" });
  }

  try {
    const tbToken = session.tbToken;
    
    // 1. Alte Contains-Beziehung entfernen
    await removeOldRelations(id, tbToken);

    // 2. Neue Contains-Beziehung in ThingsBoard erstellen
    await createNewRelation(id, newParentId, tbToken);

    // 3. Baum aus der Datenbank holen und aktualisieren
    const updatedTree = await updateTreeInDB(session.user.userid, id, newParentId);

    return res.status(200).json({
      success: true,
      message: "Asset moved successfully",
      updatedTree
    });

  } catch (error) {
    console.error("Error moving asset:", error);
    return res.status(500).json({
      message: "Error moving asset",
      error: error.message
    });
  }
}

// Funktion zum Entfernen alter Beziehungen
async function removeOldRelations(id, tbToken) {
  const response = await fetch(
    `${process.env.THINGSBOARD_URL}/api/relations?toId=${id}&toType=ASSET`,
    { headers: { "X-Authorization": `Bearer ${tbToken}` } }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch old relations");
  }

  const relations = await response.json();
  for (const relation of relations) {
    if (relation.type === "Contains") {
      await fetch(
        `${process.env.THINGSBOARD_URL}/api/relation?fromId=${relation.from.id}&fromType=ASSET&relationType=Contains&toId=${id}&toType=ASSET`,
        { method: "DELETE", headers: { "X-Authorization": `Bearer ${tbToken}` } }
      );
    }
  }
}

// Funktion zum Erstellen einer neuen Beziehung
async function createNewRelation(id, newParentId, tbToken) {
  const response = await fetch(`${process.env.THINGSBOARD_URL}/api/relation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Authorization": `Bearer ${tbToken}`
    },
    body: JSON.stringify({
      from: { entityType: "ASSET", id: newParentId },
      to: { entityType: "ASSET", id: id },
      type: "Contains"
    })
  });

  if (!response.ok) {
    throw new Error("Failed to create new relation");
  }
}

// Funktion zum Aktualisieren des Baums in der Datenbank
async function updateTreeInDB(userId, nodeId, newParentId) {
  const pool = await getConnection();
  
  // Benutzerinformationen abrufen
  const userResult = await pool.request()
    .input("userid", sql.Int, userId)
    .query(`SELECT customerid FROM hm_users WHERE userid = @userid`);

  if (userResult.recordset.length === 0) {
    throw new Error("User not found");
  }

  const customerId = userResult.recordset[0].customerid;

  // Baumstruktur abrufen
  const treeResult = await pool.request()
    .input("customer_id", sql.UniqueIdentifier, customerId)
    .query(`SELECT tree FROM customer_settings WHERE customer_id = @customer_id`);

  if (treeResult.recordset.length === 0) {
    throw new Error("No tree found for customer");
  }

  const currentTree = JSON.parse(treeResult.recordset[0].tree);

  // Verwenden der `moveNode`-Funktion zur Aktualisierung des Baums
  const updatedTree = moveNode(currentTree, nodeId, newParentId);

  console.log("+++++++++++++++++++++++++++++++ ");
  console.log(JSON.stringify(updatedTree));
  console.log("+++++++++++++++++++++++++++++++ ");

  // Baum in der Datenbank speichern
  await pool.request()
    .input("customer_id", sql.UniqueIdentifier, customerId)
    .input("tree", sql.NVarChar(sql.MAX), JSON.stringify(updatedTree))
    .query(`
      UPDATE customer_settings 
      SET tree = @tree, tree_updated = GETDATE()
      WHERE customer_id = @customer_id;

      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO customer_settings (customer_id, tree, tree_updated)
        VALUES (@customer_id, @tree, GETDATE());
      END
    `);

  return updatedTree;
}

// Funktion zum Verschieben eines Knotens innerhalb der Baumstruktur
function moveNode(tree, nodeId, newParentId) {
  let nodeToMove = null;

  // Funktion zum Entfernen des Knotens aus seinem aktuellen Eltern-Kind-Array
  function removeNode(nodes) {
    return nodes.filter(node => {
      if (node.id === nodeId) {
        nodeToMove = node;
        return false; // Entferne den Knoten aus seiner aktuellen Position
      }
      if (node.children) {
        node.children = removeNode(node.children);
      }
      return true;
    });
  }

  // Funktion zum Einfügen des Knotens in den neuen Eltern-Knoten
  function insertNode(nodes) {
    return nodes.map(node => {
      if (node.id === newParentId) {
        return { ...node, children: [...node.children, nodeToMove] };
      }
      if (node.children) {
        node.children = insertNode(node.children);
      }
      return node;
    });
  }

  const cleanedTree = removeNode(tree);
  return insertNode(cleanedTree);
}
