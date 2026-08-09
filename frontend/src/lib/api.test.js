import { adminLoginErrorMessage, normalizeBackendUrl } from "./api";

describe("backend URL handling", () => {
    test.each([
        ["https://backend.example", "https://backend.example"],
        ["https://backend.example/", "https://backend.example"],
        ["https://backend.example/api", "https://backend.example"],
        ["https://backend.example/api/", "https://backend.example"],
        ["  https://backend.example/api/  ", "https://backend.example"],
    ])("normalizes %s", (configured, expected) => {
        expect(normalizeBackendUrl(configured)).toBe(expected);
    });
});

describe("admin login errors", () => {
    test("reports genuine invalid credentials", () => {
        expect(
            adminLoginErrorMessage({
                response: { status: 401, data: { detail: "Invalid password" } },
            }),
        ).toBe("Invalid password");
    });

    test("does not call a network failure an invalid password", () => {
        expect(adminLoginErrorMessage({ request: {} })).toMatch(/Unable to reach/);
    });

    test("reports backend server failures", () => {
        expect(adminLoginErrorMessage({ response: { status: 503 } })).toMatch(/server error/);
    });

    test("reports missing frontend configuration", () => {
        expect(
            adminLoginErrorMessage({
                name: "BackendConfigError",
                message: "Backend connection is not configured.",
            }),
        ).toBe("Backend connection is not configured.");
    });
});
