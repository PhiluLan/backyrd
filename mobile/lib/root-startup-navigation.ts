export type InitialStartupSelection =
  | { kind: "no_target" }
  | { kind: "target"; receipt: string };

type LegalStartupState = "pending" | "clear" | "required";
type TargetDisposition = "dispatch";

type SelectionWaiter = (selection: InitialStartupSelection) => void;
type DispatchWaiter = (disposition: TargetDisposition) => void;

/**
 * Process-local coordinator for the one navigation decision made during an
 * iOS cold launch. It stores no route, identifier, history, or user data.
 */
export class RootStartupNavigationAuthority {
  private selection: InitialStartupSelection | null = null;
  private selectionWaiters = new Set<SelectionWaiter>();
  private dispatchWaiters = new Map<string, Set<DispatchWaiter>>();
  private entryAllowsProductTarget = false;
  private legalState: LegalStartupState = "pending";
  private closed = false;

  selectNoTarget(): boolean {
    if (this.closed) return false;
    if (this.selection) return this.selection.kind === "no_target";
    this.selection = { kind: "no_target" };
    this.flushSelection();
    return true;
  }

  selectTarget(receipt: string): boolean {
    if (this.closed || !receipt) return false;
    if (this.selection) {
      return this.selection.kind === "target" && this.selection.receipt === receipt;
    }
    this.selection = { kind: "target", receipt };
    this.flushSelection();
    this.flushDispatch();
    return true;
  }

  waitForSelection(): Promise<InitialStartupSelection> {
    if (this.closed) return Promise.resolve({ kind: "no_target" });
    if (this.selection) return Promise.resolve(this.selection);
    return new Promise((resolve) => this.selectionWaiters.add(resolve));
  }

  allowProductTargetFromEntryGate(): void {
    if (this.closed) return;
    this.entryAllowsProductTarget = true;
    this.flushDispatch();
  }

  setLegalState(state: Exclude<LegalStartupState, "pending">): void {
    if (this.closed) return;
    this.legalState = state;
    this.flushDispatch();
  }

  waitForTargetDispatch(receipt: string): Promise<TargetDisposition> {
    if (this.canDispatch(receipt)) return Promise.resolve("dispatch");
    return new Promise((resolve) => {
      const waiters = this.dispatchWaiters.get(receipt) ?? new Set<DispatchWaiter>();
      waiters.add(resolve);
      this.dispatchWaiters.set(receipt, waiters);
    });
  }

  completeDefaultStart(): boolean {
    if (this.closed || this.selection?.kind !== "no_target") return false;
    this.close();
    return true;
  }

  acknowledgeTarget(receipt: string): boolean {
    if (this.closed) return true;
    if (this.selection?.kind !== "target" || this.selection.receipt !== receipt) {
      return false;
    }
    this.close();
    return true;
  }

  private canDispatch(receipt: string): boolean {
    return (
      !this.closed &&
      this.selection?.kind === "target" &&
      this.selection.receipt === receipt &&
      this.entryAllowsProductTarget &&
      this.legalState === "clear"
    );
  }

  private flushSelection(): void {
    if (!this.selection) return;
    for (const resolve of this.selectionWaiters) resolve(this.selection);
    this.selectionWaiters.clear();
  }

  private flushDispatch(): void {
    if (this.selection?.kind !== "target") return;
    const { receipt } = this.selection;
    if (!this.canDispatch(receipt)) return;
    const waiters = this.dispatchWaiters.get(receipt);
    if (!waiters) return;
    for (const resolve of waiters) resolve("dispatch");
    this.dispatchWaiters.delete(receipt);
  }

  private close(): void {
    this.closed = true;
    this.selectionWaiters.clear();
    this.dispatchWaiters.clear();
  }
}

export const rootStartupNavigationAuthority =
  new RootStartupNavigationAuthority();
