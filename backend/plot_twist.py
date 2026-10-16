"""Isolated Plot Twist engine. No public view contains credentials or opponents' targets."""
import copy
import re
import secrets
import uuid

WORDS = """pancake ice moon cat dog pizza crown dragon robot ghost cake banana rainbow mirror pirate princess castle taxi coffee umbrella suitcase lemon balloon sandwich candle garden ocean mountain violin chocolate diamond dinosaur popcorn circus penguin rabbit rocket bicycle wedding detective elevator window blanket library camera monster butterfly treasure island thunder wizard snow beach airport kitchen cinema duck cheese fountain ladder socks spaghetti sunflower perfume tiger bus telephone cookie star pumpkin clock pocket shark watermelon piano letter shoes hat horse supermarket lipstick cloud train door baby chocolate milk queen king suitcase pillow chicken orange spider carpet ring honey hospital museum school party frog wallet mermaid spaceship giraffe dentist suitcase shampoo magnet statue beard tea soap broccoli disco vampire elephant dolphin pickle costume scooter notebook apple avocado necklace candle jungle squirrel snowman unicorn toaster bagel toaster turtle lobster shampoo jacket suitcase kettle mango cupcake lighthouse volcano swimmingpool snowflake keyboard guitar lipstick suitcase microphone moustache pineapple hamster feather cushion telescope bakery lipstick rollercoaster jellyfish yogurt slippers suitcase waterfall castle hamburger astronaut apron balcony velvet cherry cupboard waterfall pony trophy postcard passport ribbon cinema bakery puppy fountain football handbag eyebrow coconut pastry mushroom window dragonfly glitter octopus grapefruit hedgehog macaroni moonlight scarf seagull shoelace strawberry teaspoon traffic spaghetti starfish teapot umbrella watermelon whistle zebra treasure pineapple""".split()
POOL = list(dict.fromkeys(WORDS))
# Apostrophes and hyphens inside a word count as one; standalone punctuation never counts.
WORD_RE = re.compile(r"[^\W_]+(?:['’\-][^\W_]+)*", re.UNICODE)

class GameError(ValueError):
    pass

def words(text):
    return WORD_RE.findall(text)

def nickname(value):
    value = " ".join(value.split())
    if not 1 <= len(value) <= 24:
        raise GameError("Use a nickname between 1 and 24 characters.")
    return value

def add_player(game, name, simulated=False):
    if game['status'] != 'lobby':
        raise GameError("This story has already started. Reconnect on your original device.")
    if len(game['players']) >= 8:
        raise GameError("This rooftop is full (8 players).")
    name = nickname(name)
    if any(p['name'].casefold() == name.casefold() for p in game['players']):
        raise GameError("That nickname is taken in this room.")
    p = dict(id=str(uuid.uuid4()), name=name, token=secrets.token_urlsafe(32), score=0, simulated=simulated)
    game['players'].append(p)
    game['version'] += 1
    return p

def new_game(name, mode, rounds, dev=False):
    if mode not in ('story', 'trap') or not 1 <= rounds <= 10:
        raise GameError("Choose a mode and 1–10 rounds.")
    g = dict(mode=mode, rounds=rounds, dev=dev, status='lobby', players=[], contributions=[],
             targets={}, used=[], traps=[], turn=0, version=0, run=str(uuid.uuid4()))
    host = add_player(g, name)
    g['host'] = host['id']
    return g, host

def authenticate(g, pid, token):
    for p in g['players']:
        if p['id'] == pid and secrets.compare_digest(p['token'], token or ''):
            return p
    raise GameError("Your session could not be verified. Use the device where you joined.")

def target(g, pid):
    options = [w for w in POOL if w not in g['used']]
    if not options:
        # At most 80 turns, but simultaneous traps can exhaust any finite pool.
        # Keep every objective unique across a run; refuse to silently repeat one.
        g['targets'].pop(pid, None)
        return
    word = secrets.choice(options)
    g['used'].append(word)
    g['targets'][pid] = word

def start(g):
    if len(g['players']) < 2:
        raise GameError("Invite at least one friend, or add a test player.")
    if g['status'] == 'active':
        raise GameError("The story is already underway.")
    g.update(status='active', contributions=[], targets={}, used=[], traps=[], turn=0, run=str(uuid.uuid4()))
    for p in g['players']:
        p['score'] = 0
        if g['mode'] == 'trap': target(g, p['id'])
    g['version'] += 1

def submit(g, pid, text, turn, run, request_id):
    # A retry of the same accepted request returns its state, never adds another turn.
    if any(c['request_id'] == request_id and c['player'] == pid for c in g['contributions']):
        return
    if g['status'] != 'active' or run != g['run'] or turn != g['turn']:
        raise GameError("The turn changed. Your story has been refreshed.")
    if g['players'][g['turn'] % len(g['players'])]['id'] != pid:
        raise GameError("It is another player's turn.")
    text = " ".join(text.split())
    count = 5 if g['mode'] == 'story' else 7
    if len(text) > 350 or len(words(text)) != count:
        raise GameError(f"Write exactly {count} words (up to 350 characters).")
    if not request_id or len(request_id) > 80:
        raise GameError("A submission ID is required.")
    g['contributions'].append(dict(player=pid, text=text, request_id=request_id))
    tokens = {w.casefold() for w in words(text)}
    hits = [(owner, word) for owner, word in g['targets'].items() if owner != pid and word.casefold() in tokens]
    for owner, word in hits:
        next(p for p in g['players'] if p['id'] == owner)['score'] += 1
        g['traps'].append(dict(id=str(uuid.uuid4()), owner=owner, writer=pid, word=word, turn=g['turn']))
    for owner, _ in hits: target(g, owner)
    g['turn'] += 1
    if g['turn'] >= len(g['players']) * g['rounds']: g['status'] = 'ended'
    g['version'] += 1

def view(g, pid):
    return dict(mode=g['mode'], rounds=g['rounds'], dev=g['dev'], status=g['status'], host=g['host'],
                players=[{k:p[k] for k in ('id','name','score','simulated')} for p in g['players']],
                contributions=[{k:c[k] for k in ('player','text')} for c in g['contributions']],
                traps=copy.deepcopy(g['traps']), turn=g['turn'], version=g['version'], run=g['run'],
                me=pid, target=g['targets'].get(pid))

# A game can deal at most 568 cards: eight initial + 80 turns × seven traps.
POOL = list(dict.fromkeys(POOL + """airplane alarm album alley almond ambulance anchor angel ankle ant apartment aquarium arch arm arrow artist attic aunt autumn axe backpack bacon badge bakery bamboo band bank barber barn basket bat bathroom battery bear bed bedroom bee beetle bell belt bench berry bird birthday biscuit boat book bottle bowl box bracelet brain branch bread breakfast brick bridge broom brother bucket building burger bush butter button cabbage cabin cage calendar camel camp canal candy captain car carrot cashier cave ceiling cereal chair chalk chef cherry chest chimney circle city clam classroom cleaner cliff closet clown club coach coat coin collar comb computer concert cook corn corner couch country cousin cow crab cracker crane creek crocodile cucumber cup curtain dancer dawn day desert desk dessert diary dinner doctor doll donkey dream dress drum eagle ear earth earring earthquake egg evening eyebrow face factory fairy fan farm farmer father fence field fire firefighter fish flag flamingo floor flower flute fly fog forest fork fox freezer fridge friend fruit garage gate gem giant gift girl glass glasses glove goat gold golf gorilla grape grass grasshopper gravy gym hair hairbrush hairdresser hall hammer hand handle harbor hawk head headphones heart helicopter helmet hill hippo home homework hook horn hotel house hug iceberg ink insect internet iron ivory jam jar jelly jewel job juice kangaroo kayak key kid kite kitten kiwi knee knife koala lady lake lamb lamp lantern laundry leaf leg lemonade lens leopard light lion lizard loaf lock log lollipop lunch machine magic maid mailbox makeup man map marble market mask mattress medal melon message metal midnight minivan mint money monkey morning mosquito moth motor motorcycle mouse mouth movie mug music nail napkin neck needle net news newspaper night noise noodles nose nut onion opera oven owl oyster paint palace panda paper park parrot pasta path peach peanut pear pen pepper person pet photographer picnic pie pig pigeon planet plate plum police pond pool potato pot present prince printer puddle puppet puzzle quail rabbit raccoon radio rain rat raven recipe record restaurant rice river road rock roof room rope rose rug ruler salad salt sauce sausage scissors sea seal seed sheep shelf shell shirt shoe shop shoulder shower shrimp sidewalk sign sink sister skate skeleton skirt sky sled sleep slide smoke snail snake snowball soda sofa song soup sparrow spoon spring square squid stairs station steak steam stick stone stop storm stove street sugar summer sun sushi swan sweater swing sword table taco tail tape teacher television tent ticket tie toast tomato tooth tower town toy tractor tray tree triangle truck tunnel turkey turnip twins vacuum valley van vase vegetable village visitor voice waiter wall water wave web wheel wind wing winter wire wolf woman wood worm yard year yolk zoo zipper zombie acorn actor actress address adventure afternoon air audience bag bandage barbecue bean beaver bill blossom board bone boots border boss bow breadstick brush bubble buffalo bun bunny cable café cafe canoe cap carnival cauliflower cellar centipede ceremony chain chalkboard cheesecake cheetah chess chestnut chin chipmunk chips chopsticks clothes clover comedy compass conductor coral cornfield crayon cricket cub daisy delivery dough doorknob doughnut drawer driveway dust envelope exit flashlight florist flu footprint fortune fossil fryingpan furniture gallery garbage garlic goose gooseberry gown guest guide hairpin hallway harp harvest hazelnut hedge highway hiker holiday horn hose hotdog hour hyena igloo invitation ivy jackal jazz jeep jellybean judge juggler ketchup land laptop lasagna lava lawyer lettuce librarian license lifeguard lightbulb lime locket lumber lunchbox lynx magazine magician manager marshmallow mechanic meat medicine memory menu mitten model mole mop motel muffin musician mustard nightingale nightstand ninja nurse office olive otter overalls owner painter pajamas pan panther parachute parking parsnip passenger patch pathway peacock pebbles pelican pencil pepperoni petal photocopier picture pilot pin platypus playground plumber poet polar portrait powder prawn president prize professor prune pudding puma purse pyramid quilt radish raft raisin raspberry receipt recorder referee rehearsal reindeer rhino risotto robber robin roller ruby sailor salmon sand sandbox sardine satin scale scarecrow science scientist scoreboard screen screwdriver sculpture secretary shadow shamrock sheet shepherd shovel sibling skateboard ski skull skunk slipper sloth smartphone smoothie snowshoe socket soldier speaker spinach sponge sports stadium stapler sticker stork straw student submarine suit sunglasses sunrise surfboard surgeon tailor tambourine tangerine tank tart temple tennis theater theatre thread thumb timber tissue toddler toolbox toothpaste torch tortoise translator trumpet tulip tuna typewriter uncle uniform vacation valet vanilla vest vet video walrus warehouse washingmachine wasp watch weather weasel weekday weekend wheat wheelchair wish wok woodpecker wool workshop wrist xylophone yak yam yarn zucchini accountant alligator applesauce badminton ballroom barista basement bedbug beehive binoculars blackboard blindfold blueberry bookmark bouncer bowtie boyfriend bride bridesmaid briefcase bubblegum butler campsite cardboard cardigan catfish chandelier charades chocolate clipboard clubhouse coaster coconut coleslaw cork corkscrew countertop courtyard cranberry crepe croissant cruise cucumber dandelion dishwasher doormat dragonfruit dumpling earplug earmuff eggplant elf escalator espresso eyelash family firefly fishbowl fishcake flatbread flowerpot fondue frost frosting garlicbread girlfriend glacier goldfish grandfather grandmother guacamole haircut handkerchief harmonica haystack headband headlight hibiscus honeydew honeymoon horseshoe houseboat hummingbird icicle jellyroll jewelry jigsaw joystick kneecap ladle landmark lavender leotard lifeboat limousine litter locksmith lookout lumberjack macaw manatee mandarin mansion marker marmalade mascara meadow meatball milkshake minibus moccasin mooncake motorboat mountainbike mulberry nachos newsstand oatmeal omelette origami ostrich overcoat parsley paw peppermint persimmon pigtail pomegranate poncho ponytail porcupine pretzel projector pufferfish pumpkinseed pushchair quiche racetrack raincoat ravioli redwood rhubarb riverbank rowboat sailboat sandal sandcastle satellite saxophone scallop seahorse seashell sesame shoebox sidecar snowdrop snowplow sorbet spatula speedboat spoonbill sprinkler starfruit stepladder stopwatch stovetop sundae sunhat suspenders swordfish tablecloth tadpole tapir tarantula teddybear thermometer thimble thunderstorm tiara tinsel toucan tracksuit tricycle truffle turntable tweezers ukulele violets waffle warthog waterslide windmill windshield woodchuck wristwatch yoyo""".split()))
