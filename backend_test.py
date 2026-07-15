"""
Backend API Testing for Synchronized Group Voting System
Tests the new shared group voting runtime with reading/voting/wheel phases.
"""
import requests
import sys
import time
from datetime import datetime

# Use public endpoint
BASE_URL = "https://plot-node-system.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log(self, msg, level="INFO"):
        print(f"[{level}] {msg}")

    def test(self, name, condition, error_msg=""):
        """Record test result"""
        self.tests_run += 1
        if condition:
            self.tests_passed += 1
            self.log(f"✅ PASS: {name}", "PASS")
            return True
        else:
            self.log(f"❌ FAIL: {name} - {error_msg}", "FAIL")
            self.failed_tests.append({"test": name, "error": error_msg})
            return False

    def api_call(self, method, endpoint, expected_status=None, **kwargs):
        """Make API call and optionally verify status"""
        url = f"{self.base_url}{endpoint}"
        headers = kwargs.pop("headers", {})
        
        try:
            resp = requests.request(method, url, headers=headers, timeout=15, **kwargs)
            
            if expected_status and resp.status_code != expected_status:
                self.log(f"Expected {expected_status}, got {resp.status_code}: {resp.text[:200]}", "WARN")
            
            return resp
        except Exception as e:
            self.log(f"API call failed: {method} {endpoint} - {str(e)}", "ERROR")
            return None

    # ============================================================
    # Admin Tests (unchanged)
    # ============================================================

    def test_admin_login(self):
        """Admin login with correct password"""
        resp = self.api_call("POST", "/admin/login", json={"password": "admin123"})
        success = resp and resp.status_code == 200
        if success:
            data = resp.json()
            self.admin_token = data.get("token")
            success = self.admin_token is not None
        
        return self.test(
            "Admin login with password 'admin123'",
            success,
            f"Expected 200 with token, got {resp.status_code if resp else 'None'}"
        )

    def test_admin_list_stories(self):
        """Admin can list stories including seeded Zayn story"""
        headers = {"X-Admin-Token": self.admin_token}
        resp = self.api_call("GET", "/admin/stories", headers=headers)
        
        if not resp or resp.status_code != 200:
            return self.test("Admin list stories", False, f"Status {resp.status_code if resp else 'None'}")
        
        stories = resp.json()
        zayn_story = next((s for s in stories if "Zayn" in s.get("title", "")), None)
        
        has_zayn = zayn_story is not None
        has_8_nodes = zayn_story and zayn_story.get("node_count") == 8
        
        self.test(
            "Seeded 'Airport Adventure — Zayn' story exists",
            has_zayn,
            "Zayn story not found in stories list"
        )
        
        if has_zayn:
            self.zayn_story_id = zayn_story["id"]
        
        return self.test(
            "Zayn story has nodes",
            zayn_story and zayn_story.get('node_count', 0) >= 8,
            f"Expected at least 8 nodes, got {zayn_story.get('node_count') if zayn_story else 'N/A'}"
        )

    def test_admin_get_graph(self):
        """Admin can get story graph"""
        if not hasattr(self, 'zayn_story_id'):
            return self.test("Admin get graph", False, "Zayn story not available")
        
        headers = {"X-Admin-Token": self.admin_token}
        resp = self.api_call("GET", f"/admin/stories/{self.zayn_story_id}/graph", headers=headers)
        
        if not resp or resp.status_code != 200:
            return self.test("Admin get graph", False, f"Status {resp.status_code if resp else 'None'}")
        
        graph = resp.json()
        nodes = graph.get("nodes", [])
        
        return self.test(
            "Admin canvas graph has nodes",
            len(nodes) >= 8,
            f"Expected at least 8 nodes, got {len(nodes)}"
        )

    # ============================================================
    # Room & Player Tests (synchronized system)
    # ============================================================

    def test_create_room(self):
        """Create a new room"""
        resp = self.api_call("POST", "/rooms")
        if not resp or resp.status_code != 200:
            return self.test("Create room", False, f"Status {resp.status_code if resp else 'None'}")
        
        room = resp.json()
        self.test_room_code = room.get("code")
        
        return self.test(
            "Room created with code",
            self.test_room_code is not None and len(self.test_room_code) > 0,
            "No room code returned"
        )

    def test_join_room_player1(self):
        """First player joins room and becomes host"""
        if not hasattr(self, 'test_room_code'):
            return self.test("Join room (player 1)", False, "No test room available")
        
        resp = self.api_call("POST", f"/rooms/{self.test_room_code}/join", json={"nickname": "Alice"})
        if not resp or resp.status_code != 200:
            return self.test("Join room (player 1)", False, f"Status {resp.status_code if resp else 'None'}")
        
        player = resp.json()
        self.player1_id = player.get("id")
        
        self.test("Player 1 joined with nickname", player.get("nickname") == "Alice", "Nickname mismatch")
        return self.test("Player 1 is host", player.get("is_host") == True, "First player not marked as host")

    def test_join_room_player2(self):
        """Second player joins room"""
        if not hasattr(self, 'test_room_code'):
            return self.test("Join room (player 2)", False, "No test room available")
        
        resp = self.api_call("POST", f"/rooms/{self.test_room_code}/join", json={"nickname": "Bob"})
        if not resp or resp.status_code != 200:
            return self.test("Join room (player 2)", False, f"Status {resp.status_code if resp else 'None'}")
        
        player = resp.json()
        self.player2_id = player.get("id")
        
        self.test("Player 2 joined with nickname", player.get("nickname") == "Bob", "Nickname mismatch")
        return self.test("Player 2 is not host", player.get("is_host") == False, "Second player should not be host")

    def test_get_room_state(self):
        """Get room state shows both players in lobby"""
        if not hasattr(self, 'test_room_code'):
            return self.test("Get room state", False, "No test room available")
        
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Get room state", False, f"Status {resp.status_code if resp else 'None'}")
        
        state = resp.json()
        room = state.get("room", {})
        players = state.get("players", [])
        
        self.test("Room phase is 'lobby'", room.get("phase") == "lobby", f"Phase is {room.get('phase')}")
        self.test("Room has 2 players", len(players) == 2, f"Expected 2 players, got {len(players)}")
        return self.test("Room not started", room.get("started") == False, "Room should not be started yet")

    def test_select_story(self):
        """Host selects a story"""
        if not hasattr(self, 'test_room_code') or not hasattr(self, 'zayn_story_id'):
            return self.test("Select story", False, "No test room or story available")
        
        resp = self.api_call("POST", f"/rooms/{self.test_room_code}/select-story", json={"story_id": self.zayn_story_id})
        
        return self.test(
            "Select story",
            resp and resp.status_code == 200,
            f"Status {resp.status_code if resp else 'None'}"
        )

    def test_start_story(self):
        """Host starts the story"""
        if not hasattr(self, 'test_room_code'):
            return self.test("Start story", False, "No test room available")
        
        resp = self.api_call("POST", f"/rooms/{self.test_room_code}/start")
        if not resp or resp.status_code != 200:
            return self.test("Start story", False, f"Status {resp.status_code if resp else 'None'}")
        
        # Wait a moment for phase to settle
        time.sleep(0.5)
        
        # Check room state
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Start story - check state", False, "Cannot get room state")
        
        state = resp.json()
        room = state.get("room", {})
        
        self.test("Room started", room.get("started") == True, "Room not marked as started")
        self.test("Room in reading phase", room.get("phase") == "reading", f"Phase is {room.get('phase')}")
        return self.test("Room has current_node_id", room.get("current_node_id") is not None, "No current node")

    def test_reading_phase(self):
        """Verify reading phase properties"""
        if not hasattr(self, 'test_room_code'):
            return self.test("Reading phase", False, "No test room available")
        
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Reading phase", False, "Cannot get room state")
        
        state = resp.json()
        room = state.get("room", {})
        current_node = state.get("current_node", {})
        choices = state.get("choices", [])
        vote_stats = state.get("vote_stats", {})
        
        self.test("Reading phase active", room.get("phase") == "reading", f"Phase is {room.get('phase')}")
        self.test("Node has title", current_node.get("title") is not None, "No node title")
        self.test("Node has story_text", current_node.get("story_text") is not None, "No story text")
        self.test("Choices available", len(choices) > 0, "No choices available")
        self.test("Vote counter is 0/2", vote_stats.get("voted_count") == 0 and vote_stats.get("total_players") == 2, 
                 f"Vote stats: {vote_stats}")
        return self.test("Phase has end time", room.get("phase_ends_at") is not None, "No phase_ends_at")

    def test_voting_not_allowed_during_reading(self):
        """Voting should fail during reading phase"""
        if not hasattr(self, 'test_room_code') or not hasattr(self, 'player1_id'):
            return self.test("Voting blocked during reading", False, "No test room/player available")
        
        # Get current choices
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Voting blocked - get state", False, "Cannot get room state")
        
        state = resp.json()
        choices = state.get("choices", [])
        if not choices:
            return self.test("Voting blocked - has choices", False, "No choices available")
        
        choice_id = choices[0]["id"]
        
        # Try to vote during reading phase (with shorter timeout)
        try:
            resp = requests.post(
                f"{self.base_url}/rooms/{self.test_room_code}/vote",
                json={"player_id": self.player1_id, "choice_id": choice_id},
                timeout=5
            )
            return self.test(
                "Voting blocked during reading phase",
                resp.status_code == 400,
                f"Expected 400, got {resp.status_code}"
            )
        except Exception as e:
            return self.test(
                "Voting blocked during reading phase",
                False,
                f"Request failed: {str(e)}"
            )

    def test_wait_for_voting_phase(self):
        """Wait for reading phase to end and voting to begin"""
        if not hasattr(self, 'test_room_code'):
            return self.test("Wait for voting phase", False, "No test room available")
        
        self.log("Waiting 11 seconds for reading phase to end and voting to begin...")
        time.sleep(11)
        
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Wait for voting phase", False, "Cannot get room state")
        
        state = resp.json()
        room = state.get("room", {})
        
        return self.test(
            "Room transitioned to voting phase",
            room.get("phase") == "voting",
            f"Phase is {room.get('phase')}, expected 'voting'"
        )

    def test_cast_vote_player1(self):
        """Player 1 casts a vote"""
        if not hasattr(self, 'test_room_code') or not hasattr(self, 'player1_id'):
            return self.test("Cast vote (player 1)", False, "No test room/player available")
        
        # Get current choices
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Cast vote - get state", False, "Cannot get room state")
        
        state = resp.json()
        choices = state.get("choices", [])
        if not choices:
            return self.test("Cast vote - has choices", False, "No choices available")
        
        self.choice1_id = choices[0]["id"]
        
        # Cast vote
        resp = self.api_call("POST", f"/rooms/{self.test_room_code}/vote", 
                            json={"player_id": self.player1_id, "choice_id": self.choice1_id})
        
        if not resp or resp.status_code != 200:
            return self.test("Cast vote (player 1)", False, f"Status {resp.status_code if resp else 'None'}")
        
        # Check vote counter updated
        time.sleep(0.5)
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Cast vote - check counter", False, "Cannot get room state")
        
        state = resp.json()
        vote_stats = state.get("vote_stats", {})
        
        return self.test(
            "Vote counter updated to 1/2",
            vote_stats.get("voted_count") == 1 and vote_stats.get("total_players") == 2,
            f"Vote stats: {vote_stats}"
        )

    def test_cast_vote_player2_immediate_resolve(self):
        """Player 2 casts vote and story immediately advances (no tie)"""
        if not hasattr(self, 'test_room_code') or not hasattr(self, 'player2_id'):
            return self.test("Cast vote (player 2) - immediate resolve", False, "No test room/player available")
        
        # Player 2 votes for the same choice as Player 1 (no tie)
        resp = self.api_call("POST", f"/rooms/{self.test_room_code}/vote", 
                            json={"player_id": self.player2_id, "choice_id": self.choice1_id})
        
        if not resp or resp.status_code != 200:
            return self.test("Cast vote (player 2)", False, f"Status {resp.status_code if resp else 'None'}")
        
        # Wait a moment for resolution
        time.sleep(1)
        
        # Check that story advanced to next node (reading phase)
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Immediate resolve - check state", False, "Cannot get room state")
        
        state = resp.json()
        room = state.get("room", {})
        
        self.test("Story advanced to reading phase", room.get("phase") == "reading", f"Phase is {room.get('phase')}")
        return self.test("Vote counter reset to 0/2", 
                        state.get("vote_stats", {}).get("voted_count") == 0,
                        f"Vote count: {state.get('vote_stats', {}).get('voted_count')}")

    def test_shared_flags(self):
        """Verify flags are shared at room level"""
        if not hasattr(self, 'test_room_code'):
            return self.test("Shared flags", False, "No test room available")
        
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Shared flags", False, "Cannot get room state")
        
        state = resp.json()
        room = state.get("room", {})
        flags = room.get("flags", [])
        
        # The first choice (Business Class) sets "business_class" flag
        return self.test(
            "Room has shared flags",
            len(flags) > 0,
            f"Expected flags, got {flags}"
        )

    def test_reset_room(self):
        """Reset room back to lobby"""
        if not hasattr(self, 'test_room_code'):
            return self.test("Reset room", False, "No test room available")
        
        resp = self.api_call("POST", f"/rooms/{self.test_room_code}/reset")
        if not resp or resp.status_code != 200:
            return self.test("Reset room", False, f"Status {resp.status_code if resp else 'None'}")
        
        # Check room state
        time.sleep(0.5)
        resp = self.api_call("GET", f"/rooms/{self.test_room_code}")
        if not resp or resp.status_code != 200:
            return self.test("Reset - check state", False, "Cannot get room state")
        
        state = resp.json()
        room = state.get("room", {})
        
        self.test("Room phase is lobby", room.get("phase") == "lobby", f"Phase is {room.get('phase')}")
        self.test("Room not started", room.get("started") == False, "Room should not be started")
        return self.test("Flags cleared", len(room.get("flags", [])) == 0, f"Flags: {room.get('flags')}")

    def run_all_tests(self):
        """Run all backend tests"""
        self.log("=" * 60)
        self.log("Backend API Tests - Synchronized Group Voting System")
        self.log("=" * 60)
        
        # Admin tests
        self.log("\n--- ADMIN TESTS ---")
        self.test_admin_login()
        self.test_admin_list_stories()
        self.test_admin_get_graph()
        
        # Room & player tests
        self.log("\n--- ROOM & PLAYER TESTS ---")
        self.test_create_room()
        self.test_join_room_player1()
        self.test_join_room_player2()
        self.test_get_room_state()
        self.test_select_story()
        self.test_start_story()
        
        # Phase tests
        self.log("\n--- PHASE TESTS ---")
        self.test_reading_phase()
        self.test_voting_not_allowed_during_reading()
        self.test_wait_for_voting_phase()
        self.test_cast_vote_player1()
        self.test_cast_vote_player2_immediate_resolve()
        self.test_shared_flags()
        
        # Reset test
        self.log("\n--- RESET TEST ---")
        self.test_reset_room()
        
        # Summary
        self.log("\n" + "=" * 60)
        self.log(f"BACKEND TEST SUMMARY")
        self.log("=" * 60)
        self.log(f"Total Tests: {self.tests_run}")
        self.log(f"Passed: {self.tests_passed}")
        self.log(f"Failed: {self.tests_run - self.tests_passed}")
        self.log(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            self.log("\n--- FAILED TESTS ---")
            for fail in self.failed_tests:
                self.log(f"  • {fail['test']}: {fail['error']}")
        
        return self.tests_passed == self.tests_run


if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)
