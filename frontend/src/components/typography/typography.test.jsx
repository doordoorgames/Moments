import { act } from "react";
import { createRoot } from "react-dom/client";
import MomentsTypography from "./MomentsTypography";
import { typographyKind, wordCount, contrastTone, contrast } from "./typography";

global.IS_REACT_ACT_ENVIRONMENT = true;

test("headlines use editorial type and all choices use reading type", () => {
    expect(typographyKind("Where are we going today?", "headline")).toBe("display-short");
    expect(typographyKind("Where are we going in London?")).toBe("reading-long");
    expect(wordCount("شوق، زين — في لندن اليوم")).toBe(5);
    expect(wordCount("Shoug's London: day-one / 02")).toBe(5);
});

test("solid surfaces get at least 4.5:1 contrast for either preference", () => {
    for (const surface of [[255,255,255],[20,20,20],[180,196,146],[98,40,61],[227,175,190],[0,128,0],[150,150,150]]) {
        for (const preferWhite of [true, false]) {
            const tone = contrastTone(surface, preferWhite);
            expect(contrast(tone.startsWith("white") ? [255,255,255] : [20,21,20], surface)).toBeGreaterThanOrEqual(4.5);
        }
    }
});

test("dynamic content and edited form values are classified automatically", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MomentsTypography><section style={{backgroundColor:"rgb(180,196,146)"}}><h2 style={{color:"rgb(180,196,146)"}}>Choose your next adventure</h2><p>Shoug and Zain arrive in London.</p><input defaultValue="Go to London" /></section></MomentsTypography>));
    expect(host.querySelector("h2").dataset.momentsType).toBe("display-short");
    expect(host.querySelector("h2").dataset.momentsTone).toBe("dark-mint");
    expect(host.querySelector("p").dataset.momentsType).toBe("reading-long");
    await act(async () => {
        host.querySelector("input").value = "Meet Zain at the Heathrow arrivals hall";
        host.querySelector("input").dispatchEvent(new Event("input", {bubbles:true}));
        await new Promise(resolve => setTimeout(resolve, 35));
    });
    expect(host.querySelector("input").dataset.momentsType).toBe("reading-long");
    await act(async () => {
        root.render(<MomentsTypography><p>Next chapter</p></MomentsTypography>);
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
    expect(host.querySelector("p").dataset.momentsType).toBe("reading-long");
    await act(async () => root.unmount());
    host.remove();
});
