import { guideTarget, highlightParts, plainText } from "./guide";

test("key words become highlighted parts", () => {
    expect(highlightParts("Look for the **golden double doors**, and **if not, Gucci Oud**.")).toEqual([
        { text: "Look for the ", hl: false },
        { text: "golden double doors", hl: true },
        { text: ", and ", hl: false },
        { text: "if not, Gucci Oud", hl: true },
        { text: ".", hl: false },
    ]);
    expect(highlightParts("")).toEqual([]);
    expect(plainText("a **b** c")).toBe("a b c");
});

test("guide arrow follows the create path", () => {
    expect(guideTarget({ mode: null })).toBe(null);
    expect(guideTarget({ mode: "create", nickname: "" })).toBe("nick");
    expect(guideTarget({ mode: "create", nickname: "K", buttonArrow: false })).toBe(null);
    expect(guideTarget({ mode: "create", nickname: "K", buttonArrow: true })).toBe("create");
});

test("guide arrow follows the join path", () => {
    expect(guideTarget({ mode: "join", nickname: "" })).toBe("nick");
    expect(guideTarget({ mode: "join", nickname: "K", codeStep: false })).toBe(null);
    expect(guideTarget({ mode: "join", nickname: "K", codeStep: true, code: "" })).toBe("code");
    expect(guideTarget({ mode: "join", nickname: "K", codeStep: true, code: "Z" })).toBe(null);
});
