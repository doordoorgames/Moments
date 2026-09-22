"""Replace the existing Shoug's Tale placeholder graph with the v0.1 London story.

Uses the same authenticated Admin API as the CMS. Content remains in Supabase;
this file is a repeatable source-controlled import artifact, not a player fallback.
"""
from __future__ import annotations

import argparse
import json
import os
import uuid
from urllib.error import HTTPError
from urllib.request import Request, urlopen


STORY_ID = "329d3666-fdc5-4bca-ad69-b64bf4d6b8ef"
DEFAULT_API = "https://moments-production-ee12.up.railway.app/api"


def request_json(method, url, *, payload=None, token=None, timeout=60):
    headers = {"Accept": "application/json", "User-Agent": "Moments-Shoug-import/1.0"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    if token:
        headers["X-Admin-Token"] = token
    try:
        with urlopen(Request(url, data=data, headers=headers, method=method), timeout=timeout) as response:
            return json.load(response)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with HTTP {error.code}: {detail[:500]}") from error


def choice(text, destination, sets=None, requires=None):
    return {
        "id": str(uuid.uuid4()),
        "text": text,
        "destination_node_id": destination,
        "sets_flag": sets,
        "requires_flag": requires,
    }


def build_graph():
    nodes = {}

    def add(key, title, text, *, end=False):
        nodes[key] = {
            "title": f"{key} — {title}",
            "story_text": text,
            "is_end": end,
            "is_vote_gate": False,
            "is_location_gate": False,
            "choices": [],
        }

    def link(source, text, destination, *, sets=None, requires=None):
        nodes[source]["choices"].append(choice(text, destination, sets, requires))

    def onward(source, destination, text="Continue"):
        link(source, text, destination)

    scenes = [
        ("001", "Kuwait Airport", "The two families meet at Kuwait Airport. Zain is already filming everything when Shaheen arrives late."),
        ("002", "Duty Free Detour", "Shoug spots a ridiculous-looking phone strap in Duty Free."),
        ("003", "Coffee Order", "Zain disappears to collect coffees, leaving Shoug beside Shaheen."),
        ("004A", "Make Conversation", "Shaheen remembers Shoug’s exact coffee order from a previous family trip."),
        ("004B", "Escape", "Shoug retreats toward Duty Free. Later, Shaheen quietly leaves her coffee beside her seat."),
        ("005", "Gate Change", "The gate changes without warning. Everyone has to sprint across the airport."),
        ("006", "Who Carries the Bag?", "Shaheen offers to take Shoug’s heavy cabin bag."),
        ("007A", "Let Him", "Thunayan notices Shaheen carrying Shoug’s bag. He says nothing."),
        ("007B", "Refuse", "Shaheen says, “على راحتج.” Zain immediately clocks the awkwardness."),
        ("008", "Plane Seating Disaster", "The booking has separated everybody across the plane."),
        ("009", "Seat Swap Vote", "There may be one chance to rearrange the seats."),
        ("010", "Shomoukh Mention", "Zain casually says everyone has always assumed Shaheen and Shomoukh would eventually marry. Shoug simply processes it."),
        ("011", "Heathrow Arrival", "The group lands at Heathrow and joins the immigration queues."),
        ("012", "Immigration and Baggage", "Passports cleared, everyone crowds around the baggage carousel."),
        ("013", "Missing Suitcase", "One suitcase never appears."),
        ("014", "Shaheen Stays Behind", "Everyone wants to leave, but Shaheen stays with Shoug at baggage services."),
        ("015", "London Arrival", "Christmas lights slide across the car windows. London finally feels real."),
        ("016", "Check-In", "The two families reach their London accommodation and sort out the rooms."),
        ("017", "Group Chat", "Zain proposes Selfridges immediately, despite everyone being exhausted."),
        ("018", "Selfridges", "Shoug follows Zain into the bright, crowded department store."),
        ("019", "Beauty Hall", "The Rhode and beauty counters turn into chaos."),
        ("020", "Shaheen Appears", "Shaheen claims he came to find Thunayan. Thunayan is not there."),
        ("021", "Cinema Suggestion", "A cinema break is suggested while the shopping bags multiply."),
        ("022A", "Cinema", "Shoug and Zain go to the movie. Shaheen and Thunayan eventually join them."),
        ("023A", "Seat Choice", "There is one empty seat beside Shaheen."),
        ("022B", "Shoug Sleeps", "Shoug skips Selfridges and falls asleep."),
        ("023B", "11:47 PM", "She wakes to a group-chat photo of everybody eating without her."),
        ("024", "Saved Dessert", "Shaheen privately messages: “We saved you dessert.”"),
        ("025", "Morning Choice", "The next morning offers two completely different starts."),
        ("026A", "Hyde Park Run", "Shoug goes running with Zain through Hyde Park."),
        ("027A", "Zain Gives Up", "Zain abandons the run for coffee."),
        ("028A", "Shoug Keeps Running", "Shoug continues alone and unexpectedly encounters Shaheen."),
        ("029A", "Shaheen Challenge", "Shaheen challenges her to race to the next gate."),
        ("030A", "Race", "Shoug beats him. He insists she cheated, beginning a recurring joke."),
        ("026B", "Oxford Street Alone", "Shoug starts shopping early on Oxford Street."),
        ("027B", "Looking for a Shop", "She needs directions in the middle of the crowd."),
        ("028B", "Phone Snatch", "A thief reaches for Shoug’s phone."),
        ("029B", "Flash Choice", "React now: grab him before he disappears into Oxford Street."),
        ("030B", "Strap Catches", "The phone strap catches and the thief fails to take the phone."),
        ("031B", "Phone Gone", "The thief vanishes with the phone. A recovery branch opens."),
        ("032B", "Find My Phone", "The group activates Find My Phone."),
        ("033B", "Report or Chase", "The location is moving. Police report or follow the signal?"),
        ("034B", "Shaheen Finds Out", "Shaheen is about to learn what happened."),
        ("035B", "Shaheen Is Furious", "He is furious at the situation, not at Shoug. The distinction matters."),
        ("036", "Mayfair", "The group reaches Mayfair the following day."),
        ("037", "Matcha Shop", "Shoug sees Shaheen alone with a catastrophically pink drink."),
        ("038", "Pink Matcha", "Shoug decides whether to acknowledge what she has seen."),
        ("039A", "Tease", "Shaheen tries to defend his aggressively pink order."),
        ("040A", "Photo Evidence", "The drink is too ridiculous not to document."),
        ("039B", "Pretend", "Shaheen catches her pretending not to notice. “شفتج.”"),
        ("041", "Walk Through Mayfair", "They walk through Mayfair with the group nearby."),
        ("042", "Almost-Fiancée Question", "Shaheen indirectly mentions Shomoukh."),
        ("043A", "Ask", "He admits there is no engagement. “But families talk.”"),
        ("043B", "Change Subject", "Shoug changes the subject. The mystery remains."),
        ("044", "Go Anyway", "Zain is sick, Thunayan is unreachable, and the tickets are prepaid. Shoug and Shaheen go to Bicester together."),
        ("045", "Train Platform", "The platform is painfully awkward."),
        ("046", "Train Seating", "They settle into two seats on the Bicester train."),
        ("047", "First Proper Conversation", "For the first time, they talk without the entire group steering the conversation."),
        ("048", "Shomoukh Notification", "Shomoukh’s name appears on Shaheen’s phone."),
        ("049", "Bicester Arrival", "They arrive at Bicester Village."),
        ("050", "Shopping Montage", "Bags, fitting rooms, wrong turns and increasingly specific opinions fill the afternoon."),
        ("051", "Chanel Purchase Problem", "Shoug’s card is blocked for security. Shaheen quietly offers his."),
        ("052A", "Accept", "Shaheen pays. The purchase may become dangerous if Shomoukh learns about it."),
        ("052B", "Refuse", "Shoug calls the bank and fixes it herself. Shaheen is impressed rather than offended."),
        ("053", "Lunch", "They stop for lunch before the return train."),
        ("054", "Kuwait Phone Call", "Thunayan finally calls: “وينكم؟”"),
        ("055", "Train Home", "They board the train back to London."),
        ("056", "Falling Asleep", "The warm carriage makes it difficult for Shoug to stay awake."),
        ("057", "Winter Wonderland", "The group enters Hyde Park’s Winter Wonderland. This is a golden anchor scene."),
        ("058", "Group Splits", "The crowd splits everyone into smaller groups."),
        ("059", "Ride Choice", "The group votes on what to do first."),
        ("060", "Hot Chocolate", "Everyone regroups for hot chocolate."),
        ("061", "Shomoukh Appears", "Shomoukh is suddenly in London. Shaheen knew she might come; Shoug did not."),
        ("062", "Shomoukh Introduction", "Shomoukh is perfectly polite—possibly too polite."),
        ("063", "Shomoukh Takes Shaheen Away", "Shomoukh pulls Shaheen aside."),
        ("064", "Shoug Walks With Zain", "Shoug walks away with Zain through the lights."),
        ("065", "Another Man", "Shoug sees Shomoukh sharing hot chocolate with another man, away from Shaheen."),
        ("066", "Major Choice", "Shoug must decide what to do with what she saw."),
        ("067A", "Tell Shaheen", "Shoug tells Shaheen immediately."),
        ("068A", "He Doesn’t Believe Her", "Shaheen does not believe her immediately."),
        ("069A", "He Sees Them", "Shaheen sees Shomoukh and the other man himself. His entire mood changes."),
        ("067B", "Say Nothing", "Shoug says nothing."),
        ("068B", "He Learns She Knew", "Shaheen later discovers that Shoug saw them and stayed silent."),
        ("067C", "Confront Shomoukh", "Shoug approaches Shomoukh privately."),
        ("068C", "Not Your Business", "Shomoukh replies: “مو شغلج.”"),
        ("069C", "Threat", "Shomoukh warns that Kuwait may hear a very different version of the London trip."),
        ("070", "Morning Phone Call", "Shoug’s mother calls from Kuwait. Something has reached home."),
        ("071", "Who Was With You?", "Her mother asks: “منو كان معاج أمس؟”"),
        ("072", "Answer Home", "Shoug chooses how to answer."),
        ("073", "Source", "A cousin received a photo."),
        ("074", "The Cropped Photo", "The photo shows Shoug and Shaheen together. It is innocent—but cropped."),
        ("075", "Zain Investigates", "Zain starts tracing who sent the image."),
        ("076", "Shomoukh Connection", "The evidence points toward Shomoukh."),
        ("077", "Shaheen Wants to Call", "Shaheen wants to call Shomoukh immediately."),
        ("078A", "The Call", "The phone call turns into a huge argument."),
        ("078B", "Stop the Call", "Shoug says this is becoming bigger than it needs to be."),
        ("079", "Group Day Out", "The group plans an alternative London day together."),
        ("080", "Thorpe Park", "They arrive at Thorpe Park."),
        ("081", "Ride Challenge", "The group dares everyone onto the next ride."),
        ("082", "Shaheen Hates the Ride", "Shaheen unexpectedly hates one ride."),
        ("083", "Separated", "Shoug and Shaheen become separated from the group."),
        ("084", "Rain", "Rain forces them under the same shelter."),
        ("085", "Almost-Conversation", "Shaheen starts explaining Shomoukh. His phone rings."),
        ("086", "Shomoukh Ultimatum", "Only Shaheen hears the full ultimatum."),
        ("087", "Shaheen Returns Different", "Shaheen returns visibly changed."),
        ("088", "Harrods", "Everybody is together at Harrods, but the atmosphere is wrong."),
        ("089", "Shomoukh Arrives", "Shomoukh deliberately makes it look as though she and Shaheen have reconciled."),
        ("090", "Shoug Reacts", "Shoug decides how to respond."),
        ("091A", "Walk Away", "Shoug leaves. Shaheen follows only if enough trust survived London."),
        ("091B", "Unbothered", "Shoug stays completely unbothered. Shomoukh becomes frustrated and escalates."),
        ("091C", "Ask Directly", "Shoug asks: “Are you actually going to marry her?” Shaheen has to answer."),
        ("092", "Family Call", "Something Shomoukh sent has now reached Kuwait."),
        ("093", "Thunayan Steps In", "For the first time, Shoug’s brother becomes central rather than decorative."),
        ("094", "Brother and Shaheen", "Thunayan and Shaheen speak privately. The player does not hear all of it."),
        ("095", "Final London Night", "Regent Street glows on the final night in London."),
        ("096", "Bags Packed", "The phone strap, pink matcha photo, Bicester purchase, cinema and stolen-phone incident return as callbacks."),
        ("097", "Drive to Heathrow", "The group drives toward Heathrow."),
        ("098", "Check-In", "Bags are weighed and boarding passes are printed."),
        ("099", "Shomoukh’s Last Move", "A final message arrives. Its meaning depends on everything that happened."),
        ("100", "Message Decision", "Shoug decides what to do with the message."),
        ("101", "Airport Café", "Shaheen asks Shoug to sit with him for five minutes."),
        ("102", "The Conversation", "This is not automatically a confession. Their London choices shape what Shoug is ready to say."),
        ("103A", "See You in Kuwait", "With trust and closeness intact, Shaheen says he does not want London to be only a thing that happened."),
        ("104A", "Gate", "He walks toward his family. Shoug’s phone buzzes: “وصلتوا قوليلي.”"),
        ("103B", "Not Yet", "Shoug tells Shaheen he needs to sort his life out first. He accepts it."),
        ("104B", "Heathrow", "Shaheen says: “إن شاء الله مو آخر مرة نتكلم.” She waits, then smiles."),
        ("103C", "Leave Him Alone", "Shaheen is wrecked by the Shomoukh situation. Shoug refuses to become his rebound."),
        ("104C", "Plane Takes Off", "Zain asks, “يعني خلاص؟” Shoug answers, “مادري.” The plane lifts into the sky."),
        ("103D", "Wrong London", "Low trust and high family heat have poisoned the situation. They barely speak at Heathrow."),
        ("104D", "Kuwait Arrival", "One message waits from Shaheen: “إذا هديت الأمور، أبي أشرح لج.”"),
        ("103R", "The Hidden London", "A strange collection of tiny decisions reveals a version of London the group was never supposed to find."),
        ("104R", "Their Particular Trip", "The strap, matcha photo, Bicester bag and roller-coaster secret become a private language. Shaheen asks to continue it in Kuwait."),
    ]
    for key, title, text in scenes:
        add(key, title, text, end=key in {"104A", "104B", "104C", "104R"})

    onward("001", "002")
    link("002", "Buy the ridiculous strap", "003", sets="PHONE_SAFE")
    link("002", "Leave it", "003")
    link("003", "Make conversation", "004A", sets="SHAHEEN_CLOSENESS")
    link("003", "Become interested in Duty Free", "004B")
    onward("004A", "005"); onward("004B", "005"); onward("005", "006")
    link("006", "Let him carry it", "007A", sets="FAMILY_HEAT")
    link("006", "Absolutely not", "007B")
    onward("007A", "008"); onward("007B", "008"); onward("008", "009")
    link("009", "Ask to swap", "010", sets="SHAHEEN_CLOSENESS")
    link("009", "Keep the assigned seats", "010")
    for a, b in [("010","011"),("011","012"),("012","013"),("013","014")]: onward(a,b)
    link("014", "Tell him to go", "015")
    link("014", "Let him stay", "015", sets="SHOUG_TRUST")
    onward("015", "016"); onward("016", "017")
    link("017", "Go to Selfridges", "018"); link("017", "Sleep", "022B")
    onward("018", "019"); onward("019", "020"); onward("020", "021")
    link("021", "Go to the movie", "022A"); link("021", "Keep shopping", "025")
    onward("022A", "023A")
    link("023A", "Sit beside Shaheen", "025", sets="SHAHEEN_CLOSENESS")
    link("023A", "Make Zain sit there", "025")
    onward("022B", "023B")
    link("023B", "Reply dramatically", "024"); link("023B", "Ignore them", "024")
    onward("024", "025")
    link("025", "Run with Zain", "026A"); link("025", "Start shopping early", "026B")
    onward("026A", "027A"); onward("027A", "028A"); onward("028A", "029A")
    link("029A", "Race", "030A", sets="SHAHEEN_CLOSENESS"); link("029A", "Absolutely not", "036")
    onward("030A", "036")
    onward("026B", "027B")
    link("027B", "Take the phone out", "028B"); link("027B", "Ask someone", "036")
    onward("028B", "029B", "GRAB HIM!")
    link("029B", "The strap catches", "030B", sets="PHONE_SAFE", requires="PHONE_SAFE")
    link("029B", "The phone is gone", "031B")
    onward("030B", "036")
    onward("031B", "032B"); onward("032B", "033B")
    link("033B", "File a police report", "034B"); link("033B", "Chase the location", "034B")
    link("034B", "Tell Shaheen", "035B", sets="SHOUG_TRUST"); link("034B", "Hide it", "035B")
    onward("035B", "036"); onward("036", "037"); onward("037", "038")
    link("038", "Tease him", "039A", sets="SHAHEEN_CLOSENESS"); link("038", "Pretend you didn’t notice", "039B")
    onward("039A", "040A")
    link("040A", "Take a photo", "041", sets="MATCHA_PHOTO"); link("040A", "Spare him", "041")
    onward("039B", "041"); onward("041", "042")
    link("042", "Ask about Shomoukh", "043A", sets="SHOUG_TRUST"); link("042", "Change subject", "043B")
    onward("043A", "044"); onward("043B", "044")
    for a, b in [("044","045"),("045","046"),("046","047"),("047","048")]: onward(a,b)
    link("048", "Look away", "049"); link("048", "Joke about it", "049", sets="SHAHEEN_CLOSENESS")
    onward("049", "050"); onward("050", "051")
    link("051", "Accept", "052A", sets="BICESTER_CARD"); link("051", "Refuse", "052B", sets="SHOUG_TRUST")
    onward("052A", "053"); onward("052B", "053"); onward("053", "054")
    link("054", "Tell him exactly", "055"); link("054", "Let Shaheen answer", "055", sets="FAMILY_HEAT")
    onward("055", "056")
    link("056", "Stay awake", "057"); link("056", "Sleep", "057", sets="SHAHEEN_CLOSENESS")
    for a, b in [("057","058"),("058","059")]: onward(a,b)
    link("059", "Choose the biggest ride", "060"); link("059", "Choose the games", "060")
    for a, b in [("060","061"),("061","062"),("062","063"),("063","064"),("064","065"),("065","066")]: onward(a,b)
    link("066", "Tell Shaheen now", "067A", sets="SHOMOUKH_SECRET")
    link("066", "Say nothing", "067B")
    link("066", "Confront Shomoukh privately", "067C", sets="SHOMOUKH_WAR")
    onward("067A", "068A")
    link("068A", "Push", "069A", sets="SHAHEEN_TRUST"); link("068A", "Drop it", "069A")
    onward("069A", "070"); onward("067B", "068B"); onward("068B", "070")
    onward("067C", "068C"); onward("068C", "069C"); onward("069C", "070")
    onward("070", "071"); onward("071", "072")
    link("072", "Tell the truth", "073", sets="SHOUG_TRUST"); link("072", "Minimize it", "073", sets="FAMILY_HEAT"); link("072", "Ask who told her", "073")
    for a, b in [("073","074"),("074","075"),("075","076"),("076","077")]: onward(a,b)
    link("077", "Let him call", "078A", sets="SHOMOUKH_WAR"); link("077", "Stop him", "078B", sets="SHAHEEN_TRUST")
    onward("078A", "079"); onward("078B", "079")
    onward("079", "080"); onward("080", "081"); onward("081", "082")
    link("082", "Expose him", "083"); link("082", "Protect his dignity", "083", sets="RARE_KINDNESS")
    for a, b in [("083","084"),("084","085"),("085","086"),("086","087")]: onward(a,b)
    link("087", "Ask what happened", "088"); link("087", "Give him space", "088", sets="RARE_ROUTE")
    onward("088", "089"); onward("089", "090")
    link("090", "Leave", "091A"); link("090", "Stay completely unbothered", "091B"); link("090", "Ask Shaheen directly", "091C", sets="SHOUG_TRUST")
    onward("091A", "092"); onward("091B", "092"); onward("091C", "092")
    onward("092", "093"); onward("093", "094"); onward("094", "095")
    link("095", "Go out with everyone", "096", sets="SHAHEEN_CLOSENESS"); link("095", "Stay in", "096"); link("095", "Go out but avoid Shaheen", "096")
    onward("096", "097"); onward("097", "098"); onward("098", "099")
    link("099", "Read the message", "100")
    link("100", "Show Shaheen", "101", sets="SHAHEEN_TRUST"); link("100", "Delete it", "101"); link("100", "Send it to Zain", "101")
    link("101", "Sit for five minutes", "102", sets="SHAHEEN_CLOSENESS"); link("101", "Keep walking", "103C")
    link("102", "Tell him London should continue in Kuwait", "103A", requires="SHAHEEN_TRUST")
    link("102", "Tell him: not yet", "103B")
    link("102", "Give him space", "103C")
    link("102", "End the conversation", "103D", requires="FAMILY_HEAT")
    link("102", "Unlock their particular London", "103R", requires="RARE_ROUTE")
    onward("103A", "104A"); onward("103B", "104B"); onward("103C", "104C"); onward("103D", "104D")
    link("104D", "Open", "104A"); link("104D", "Leave unread", "104C")
    onward("103R", "104R")

    # Readable Admin layout: ten columns, with branch variants staggered vertically.
    for index, (key, node) in enumerate(nodes.items()):
        numeric = int("".join(ch for ch in key if ch.isdigit()) or index)
        suffix = key[-1] if key[-1].isalpha() else ""
        node["position_x"] = 120 + ((numeric - 1) % 10) * 360
        node["position_y"] = 120 + ((numeric - 1) // 10) * 300 + ({"A": 0, "B": 90, "C": 180, "D": 270, "R": 360}.get(suffix, 0))
    return nodes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=os.environ.get("MOMENTS_API_URL", DEFAULT_API))
    parser.add_argument("--password", default=os.environ.get("MOMENTS_ADMIN_PASSWORD"))
    args = parser.parse_args()
    if not args.password:
        raise SystemExit("Set MOMENTS_ADMIN_PASSWORD or pass --password")

    token = request_json("POST", f"{args.api}/admin/login", payload={"password": args.password})["token"]
    graph = request_json("GET", f"{args.api}/admin/stories/{STORY_ID}/graph", token=token)
    nodes = build_graph()
    operations = [{"action": "delete", "node_id": node["id"], "reason": "Replace verification graph"} for node in graph["nodes"]]
    operations.extend({"action": "create", "temp_id": key, "node": node} for key, node in nodes.items())
    proposal = {"summary": "Import Shoug’s Tale v0.1 London branching story", "operations": operations}
    result = request_json(
        "POST",
        f"{args.api}/admin/ramble/apply",
        payload={"story_id": STORY_ID, "proposal": proposal},
        token=token,
        timeout=900,
    )
    start_id = result["created_id_map"]["001"]
    request_json(
        "POST",
        f"{args.api}/admin/stories/{STORY_ID}/set-start?node_id={start_id}",
        token=token,
    )
    refreshed = request_json("GET", f"{args.api}/admin/stories/{STORY_ID}/graph", token=token, timeout=120)
    assert refreshed["story"]["start_node_id"] == start_id
    assert len(refreshed["nodes"]) == len(nodes)
    print(json.dumps({"story_id": STORY_ID, "nodes": len(nodes), "start_node_id": start_id}, indent=2))


if __name__ == "__main__":
    main()
