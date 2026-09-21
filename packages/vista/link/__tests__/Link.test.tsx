/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { useRouter } from "next/router";
import { Link } from "../src/Link";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

const pushMock = jest.fn();

beforeEach(() => {
  // @ts-ignore – mock implementation
  useRouter.mockReturnValue({ push: pushMock });
  pushMock.mockClear();
});

describe("Link component", () => {
  it("navigates client‑side for internal links", () => {
    const { getByText } = render(
      <Link href="/about">About</Link>
    );

    fireEvent.click(getByText("About"));
    expect(pushMock).toHaveBeenCalledWith("/about");
  });

  it("does not intercept external links", () => {
    const externalHref = "https://example.com";
    const { getByText } = render(
      <Link href={externalHref}>External</Link>
    );

    const anchor = getByText("External") as HTMLAnchorElement;
    fireEvent.click(anchor);
    // push should not be called for external URLs
    expect(pushMock).not.toHaveBeenCalled();
    // The anchor's href should remain unchanged
    expect(anchor.getAttribute("href")).toBe(externalHref);
  });

  it("adds noopener noreferrer when target=_blank on external links", () => {
    const externalHref = "https://example.com";
    const { getByText } = render(
      <Link href={externalHref} target="_blank">
        External Blank
      </Link>
    );

    const anchor = getByText("External Blank") as HTMLAnchorElement;
    expect(anchor.getAttribute("rel")).toContain("noopener");
    expect(anchor.getAttribute("rel")).toContain("noreferrer");
  });

  it("respects a custom onClick handler", () => {
    const customHandler = jest.fn((e) => e.preventDefault());
    const { getByText } = render(
      <Link href="/custom" onClick={customHandler}>
        Custom
      </Link>
    );

    fireEvent.click(getByText("Custom"));
    expect(customHandler).toHaveBeenCalled();
    // Because the custom handler called preventDefault, router.push should not run.
    expect(pushMock).not.toHaveBeenCalled();
  });
});
