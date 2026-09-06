import type { EventSourceAdapter, NormalizedEventRecord } from "./contracts.js";

abstract class ContractPendingAdapter implements EventSourceAdapter {
  abstract readonly sourceId: string;
  abstract readonly contractRequirement: string;

  async fetch(_input: {
    from: string;
    to: string;
    modifiedSince?: string;
  }): Promise<NormalizedEventRecord[]> {
    throw new Error(
      `${this.sourceId} is disabled: ${this.contractRequirement}. HTML fallback is prohibited.`,
    );
  }
}

export class ProgOnlineAdapter extends ContractPendingAdapter {
  readonly sourceId = "progonline";
  readonly contractRequirement =
    "activate only after API credentials and downstream data/image rights are documented";
}

export class BaselLiveAdapter extends ContractPendingAdapter {
  readonly sourceId = "basellive";
  readonly contractRequirement =
    "activate only after an explicit BaselLive/Flyo partnership permits ingestion";
}
