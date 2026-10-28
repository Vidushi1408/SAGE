import { describe, it, expect, vi, afterEach } from "vitest";
import { saveBlob } from "./download";

afterEach(() => vi.restoreAllMocks());

describe("saveBlob", () => {
  it("clicks a temporary download link with the filename, then cleans up", () => {
    URL.createObjectURL = vi.fn(() => "blob:abc");
    URL.revokeObjectURL = vi.fn();
    const clicks: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ download: this.download, href: this.href });
    });

    saveBlob(new Blob(["x"]), "sage-export.zip");

    expect(clicks).toEqual([{ download: "sage-export.zip", href: "blob:abc" }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:abc");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
