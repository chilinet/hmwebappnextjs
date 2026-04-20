import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import {
  fetchAlarmsFromPg,
  validateAlarmsPgQuery,
} from "../../../lib/alarmsFromPg";
import {
  loadCustomerSettingsTree,
  resolveDevicePathFromCustomerTree,
} from "../../../lib/customerTreeDevicePath";

/**
 * Parallele Pfad-Anreicherung begrenzen (reine Baum-Traversierung im Speicher).
 */
const ALARM_PATH_ENRICH_CONCURRENCY = Math.max(
  1,
  Math.min(
    12,
    parseInt(process.env.ALARM_DEVICE_ENRICH_CONCURRENCY || "4", 10) || 4
  )
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const {
    customer_id,
    limit: limitRaw,
    offset: offsetRaw,
    status = "ACTIVE",
    start_id,
  } = req.query;

  const validation = validateAlarmsPgQuery({
    customer_id,
    limit: limitRaw,
    offset: offsetRaw,
    start_id,
  });

  if (validation.errors.length > 0) {
    return res.status(400).json({
      message: "Invalid parameters",
      details: validation.errors,
    });
  }

  const { customerId, startId, limit, offset } = validation;

  if (
    String(session.user.customerid || "").toLowerCase() !==
    customerId.toLowerCase()
  ) {
    return res.status(403).json({ message: "customer_id does not match session" });
  }

  try {
    const { data: alarmsRaw, totalCount } = await fetchAlarmsFromPg({
      customerId,
      startId,
      status,
      limit,
      offset,
    });

    let alarms = alarmsRaw;

    if (alarms.length > 0) {
      try {
        const treeData = await loadCustomerSettingsTree(customerId);

        async function enrichOne(alarm) {
          const assetId = alarm._assetIdForPath;
          const { _assetIdForPath, ...rest } = alarm;
          const deviceId = rest.device?.id;
          let devicePath = null;
          if (treeData && deviceId) {
            devicePath = resolveDevicePathFromCustomerTree(
              treeData,
              deviceId,
              assetId
            );
          }
          return { ...rest, devicePath };
        }

        const enriched = [];
        for (let i = 0; i < alarms.length; i += ALARM_PATH_ENRICH_CONCURRENCY) {
          const chunk = alarms.slice(i, i + ALARM_PATH_ENRICH_CONCURRENCY);
          enriched.push(...(await Promise.all(chunk.map(enrichOne))));
        }
        alarms = enriched;
      } catch (error) {
        console.error("Error enriching alarms with device path:", error);
        alarms = alarmsRaw.map(({ _assetIdForPath, ...rest }) => rest);
      }
    }

    const metadata = {
      total_records: totalCount,
      limit,
      offset,
      query_time: new Date().toISOString(),
      customer_id: customerId,
      start_id: startId || null,
      status,
      source: "postgresql",
    };

    return res.status(200).json({
      success: true,
      metadata,
      data: alarms,
    });
  } catch (error) {
    console.error("Error fetching alarms from PostgreSQL:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Fehler beim Laden der Alarme",
      details: error.message,
    });
  }
}
