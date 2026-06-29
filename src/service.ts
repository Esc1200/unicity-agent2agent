/**
 * Data enrichment service — the business logic Agent A runs.
 * Pure functions, no SDK dependency. Easily testable.
 */

import type { ServiceRequest, ServiceResponse } from "./shared.js";

/**
 * Enrich a data request. This is a toy example — in production this could
 * call external APIs, run ML inference, query databases, etc.
 *
 * The key point: this function is deterministic and composable.
 * The agent calls it after receiving payment, then delivers the result.
 */
export function enrich(request: ServiceRequest): ServiceResponse {
  const now = new Date().toISOString();

  switch (request.task) {
    case "lookup":
      return {
        task: "lookup",
        result: {
          query: request.data.query,
          status: "found",
          confidence: 0.95,
          source: "unicity-enricher-v1",
          enrichedAt: now,
        },
        timestamp: now,
      };

    case "score":
      return {
        task: "score",
        result: {
          entity: request.data.entity,
          score: Math.floor(Math.random() * 100),
          risk: "low",
          model: "enricher-v1",
          scoredAt: now,
        },
        timestamp: now,
      };

    case "verify":
      return {
        task: "verify",
        result: {
          claim: request.data.claim,
          verified: true,
          method: "cross-reference",
          verifiedAt: now,
        },
        timestamp: now,
      };

    default:
      return {
        task: request.task,
        result: {
          error: `Unknown task: ${request.task}`,
          supported: ["lookup", "score", "verify"],
        },
        timestamp: now,
      };
  }
}
