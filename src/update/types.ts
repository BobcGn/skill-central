export type UpdateProvider = "none" | "homebrew" | "github";

export type UpdateStatus =
  | "unsupported"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface UpdateSnapshot {
  supported: boolean;
  provider: UpdateProvider;
  currentVersion: string;
  status: UpdateStatus;
  availableVersion?: string;
  progressPercent?: number;
  message?: string;
}

export interface UpdateController {
  getSnapshot(): UpdateSnapshot;
  check(): Promise<UpdateSnapshot>;
  install(): Promise<UpdateSnapshot>;
}

export class UnsupportedUpdateController implements UpdateController {
  private readonly snapshot: UpdateSnapshot;

  constructor(currentVersion: string, message: string) {
    this.snapshot = {
      supported: false,
      provider: "none",
      currentVersion,
      status: "unsupported",
      message,
    };
  }

  getSnapshot(): UpdateSnapshot {
    return { ...this.snapshot };
  }

  async check(): Promise<UpdateSnapshot> {
    return this.getSnapshot();
  }

  async install(): Promise<UpdateSnapshot> {
    return this.getSnapshot();
  }
}
