"""Isolated Plot Twist engine. No public view contains credentials or opponents' targets."""
import copy
import re
import secrets
import uuid

WORDS = """pancake ice moon cat dog pizza crown dragon robot ghost cake banana rainbow mirror pirate princess castle taxi coffee umbrella suitcase lemon balloon sandwich candle garden ocean mountain violin chocolate diamond dinosaur popcorn circus penguin rabbit rocket bicycle wedding detective elevator window blanket library camera monster butterfly treasure island thunder wizard snow beach airport kitchen cinema duck cheese fountain ladder socks spaghetti sunflower perfume tiger bus telephone cookie star pumpkin clock pocket shark watermelon piano letter shoes hat horse supermarket lipstick cloud train door baby chocolate milk queen king suitcase pillow chicken orange spider carpet ring honey hospital museum school party frog wallet mermaid spaceship giraffe dentist suitcase shampoo magnet statue beard tea soap broccoli disco vampire elephant dolphin pickle costume scooter notebook apple avocado necklace candle jungle squirrel snowman unicorn toaster bagel toaster turtle lobster shampoo jacket suitcase kettle mango cupcake lighthouse volcano swimmingpool snowflake keyboard guitar lipstick suitcase microphone moustache pineapple hamster feather cushion telescope bakery lipstick rollercoaster jellyfish yogurt slippers suitcase waterfall castle hamburger astronaut apron balcony velvet cherry cupboard waterfall pony trophy postcard passport ribbon cinema bakery puppy fountain football handbag eyebrow coconut pastry mushroom window dragonfly glitter octopus grapefruit hedgehog macaroni moonlight scarf seagull shoelace strawberry teaspoon traffic spaghetti starfish teapot umbrella watermelon whistle zebra treasure pineapple""".split()
POOL = list(dict.fromkeys(WORDS))
# Apostrophes and hyphens inside a word count as one; standalone punctuation never counts.
WORD_RE = re.compile(r"[^\W_]+(?:['’\-][^\W_]+)*", re.UNICODE)

LANGS = ('en', 'ar')
TRAP_MIN, TRAP_MAX = 5, 15
STORY_WORDS = 5
# Arabic diacritics and tatweel never split or add a word.
MARKS = re.compile('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]')

class GameError(ValueError):
    """Carries the English and Kuwaiti Arabic message; the room's language picks one."""
    def __init__(self, en, ar=None):
        super().__init__(en)
        self.ar = ar or en
    def text(self, lang):
        return self.ar if lang == 'ar' else str(self)

def lang_of(g):
    return g.get('lang', 'en')

def words(text):
    return WORD_RE.findall(MARKS.sub('', text))

def nickname(value):
    value = " ".join(value.split())
    if not 1 <= len(value) <= 24:
        raise GameError("Use a nickname between 1 and 24 characters.", "اكتب اسم من حرف إلى 24 حرف.")
    return value

def add_player(game, name, simulated=False):
    if game['status'] != 'lobby':
        raise GameError("This story has already started. Reconnect on your original device.",
                        "السالفة بدت خلاص. ارجع من نفس الجهاز اللي دخلت منه.")
    if len(game['players']) >= 8:
        raise GameError("This rooftop is full (8 players).", "السطح فل (8 لاعبين).")
    name = nickname(name)
    if any(p['name'].casefold() == name.casefold() for p in game['players']):
        raise GameError("That nickname is taken in this room.", "هالاسم مأخوذ في هالغرفة.")
    p = dict(id=str(uuid.uuid4()), name=name, token=secrets.token_urlsafe(32), score=0, simulated=simulated)
    game['players'].append(p)
    game['version'] += 1
    return p

def new_game(name, mode, rounds, dev=False, lang='en'):
    if lang not in LANGS:
        raise GameError("Choose English or Arabic.", "اختار إنجليزي أو عربي.")
    if mode == 'trap':
        rounds = 0  # Word Trap has no rounds and no clock: it runs until the host ends it.
    elif mode != 'story' or not 1 <= rounds <= 10:
        raise GameError("Choose a mode and 1–10 rounds.", "اختار نوع اللعبة ومن 1 إلى 10 جولات.")
    g = dict(mode=mode, rounds=rounds, dev=dev, lang=lang, status='lobby', players=[], contributions=[],
             targets={}, used=[], traps=[], turn=0, version=0, run=str(uuid.uuid4()))
    host = add_player(g, name)
    g['host'] = host['id']
    return g, host

def authenticate(g, pid, token):
    for p in g['players']:
        if p['id'] == pid and secrets.compare_digest(p['token'], token or ''):
            return p
    raise GameError("Your session could not be verified. Use the device where you joined.",
                    "ما قدرنا نتأكد منك. استخدم نفس الجهاز اللي دخلت منه.")

def pool(g):
    return AR_POOL if lang_of(g) == 'ar' else POOL

def target(g, pid):
    live = {w for owner, w in g['targets'].items() if owner != pid}
    options = [w for w in pool(g) if w not in g['used']]
    if not options:
        # Open-ended stories can outlast the pool: start a fresh lap, never
        # handing out a word someone else is holding right now.
        g['used'] = list(live)
        options = [w for w in pool(g) if w not in live]
    word = secrets.choice(options)
    g['used'].append(word)
    g['targets'][pid] = word

def start(g):
    if len(g['players']) < 2:
        raise GameError("Invite at least one friend, or add a test player.", "اعزم صديق واحد على الأقل.")
    if g['status'] == 'active':
        raise GameError("The story is already underway.", "السالفة شغالة.")
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
        raise GameError("The turn changed. Your story has been refreshed.", "الدور تغيّر. حدّثنا لك السالفة.")
    if g['players'][g['turn'] % len(g['players'])]['id'] != pid:
        raise GameError("It is another player's turn.", "مو دورك الحين.")
    text = " ".join(text.split())
    n = len(words(text))
    if g['mode'] == 'story':
        if len(text) > 350 or n != STORY_WORDS:
            raise GameError(f"Write exactly {STORY_WORDS} words (up to 350 characters).", f"اكتب {STORY_WORDS} كلمات بالضبط.")
    elif len(text) > 350 or not TRAP_MIN <= n <= TRAP_MAX:
        raise GameError(f"Write {TRAP_MIN} to {TRAP_MAX} words (up to 350 characters).", f"اكتب من {TRAP_MIN} إلى {TRAP_MAX} كلمة.")
    if not request_id or len(request_id) > 80:
        raise GameError("A submission ID is required.")
    g['contributions'].append(dict(player=pid, text=text, request_id=request_id))
    tokens = {key(w) for w in words(text)}
    hits = [(owner, word) for owner, word in g['targets'].items() if owner != pid and said(word, tokens)]
    for owner, word in hits:
        next(p for p in g['players'] if p['id'] == owner)['score'] += 1
        g['traps'].append(dict(id=str(uuid.uuid4()), owner=owner, writer=pid, word=word, turn=g['turn']))
    for owner, _ in hits: target(g, owner)
    g['turn'] += 1
    # Story Time ends after its rounds; Word Trap stays open until the host ends it.
    if g['mode'] == 'story' and g['turn'] >= len(g['players']) * g['rounds']: g['status'] = 'ended'
    g['version'] += 1

def end(g):
    if g['status'] != 'active':
        raise GameError("There is no story running.", "ما في سالفة شغالة.")
    g['status'] = 'ended'
    g['version'] += 1

# Arabic matching: spelling variants of alef/ta marbuta/ya count as the same
# letter, and a word still counts with و ف ب ك ل or ال stuck to its front.
AR_FOLD = str.maketrans({'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ة':'ه','ى':'ي','ئ':'ي','ؤ':'و'})
AR_PREFIXES = ('', 'ال', 'و', 'ف', 'ب', 'ك', 'ل', 'وال', 'فال', 'بال', 'كال', 'لل', 'ولل', 'فلل')

def key(w):
    return MARKS.sub('', w).casefold().translate(AR_FOLD)

def said(word, tokens):
    w = key(word)
    if w.isascii():
        return w in tokens
    return any(p + w in tokens for p in AR_PREFIXES)

def view(g, pid):
    lo, hi = (STORY_WORDS, STORY_WORDS) if g['mode'] == 'story' else (TRAP_MIN, TRAP_MAX)
    return dict(mode=g['mode'], rounds=g['rounds'], dev=g['dev'], lang=lang_of(g), min_words=lo, max_words=hi,
                status=g['status'], host=g['host'],
                players=[{k:p[k] for k in ('id','name','score','simulated')} for p in g['players']],
                contributions=[{k:c[k] for k in ('player','text')} for c in g['contributions']],
                traps=copy.deepcopy(g['traps']), turn=g['turn'], version=g['version'], run=g['run'],
                me=pid, target=g['targets'].get(pid))

POOL = list(dict.fromkeys(POOL + """airplane alarm album alley almond ambulance anchor angel ankle ant apartment aquarium arch arm arrow artist attic aunt autumn axe backpack bacon badge bakery bamboo band bank barber barn basket bat bathroom battery bear bed bedroom bee beetle bell belt bench berry bird birthday biscuit boat book bottle bowl box bracelet brain branch bread breakfast brick bridge broom brother bucket building burger bush butter button cabbage cabin cage calendar camel camp canal candy captain car carrot cashier cave ceiling cereal chair chalk chef cherry chest chimney circle city clam classroom cleaner cliff closet clown club coach coat coin collar comb computer concert cook corn corner couch country cousin cow crab cracker crane creek crocodile cucumber cup curtain dancer dawn day desert desk dessert diary dinner doctor doll donkey dream dress drum eagle ear earth earring earthquake egg evening eyebrow face factory fairy fan farm farmer father fence field fire firefighter fish flag flamingo floor flower flute fly fog forest fork fox freezer fridge friend fruit garage gate gem giant gift girl glass glasses glove goat gold golf gorilla grape grass grasshopper gravy gym hair hairbrush hairdresser hall hammer hand handle harbor hawk head headphones heart helicopter helmet hill hippo home homework hook horn hotel house hug iceberg ink insect internet iron ivory jam jar jelly jewel job juice kangaroo kayak key kid kite kitten kiwi knee knife koala lady lake lamb lamp lantern laundry leaf leg lemonade lens leopard light lion lizard loaf lock log lollipop lunch machine magic maid mailbox makeup man map marble market mask mattress medal melon message metal midnight minivan mint money monkey morning mosquito moth motor motorcycle mouse mouth movie mug music nail napkin neck needle net news newspaper night noise noodles nose nut onion opera oven owl oyster paint palace panda paper park parrot pasta path peach peanut pear pen pepper person pet photographer picnic pie pig pigeon planet plate plum police pond pool potato pot present prince printer puddle puppet puzzle quail rabbit raccoon radio rain rat raven recipe record restaurant rice river road rock roof room rope rose rug ruler salad salt sauce sausage scissors sea seal seed sheep shelf shell shirt shoe shop shoulder shower shrimp sidewalk sign sink sister skate skeleton skirt sky sled sleep slide smoke snail snake snowball soda sofa song soup sparrow spoon spring square squid stairs station steak steam stick stone stop storm stove street sugar summer sun sushi swan sweater swing sword table taco tail tape teacher television tent ticket tie toast tomato tooth tower town toy tractor tray tree triangle truck tunnel turkey turnip twins vacuum valley van vase vegetable village visitor voice waiter wall water wave web wheel wind wing winter wire wolf woman wood worm yard year yolk zoo zipper zombie acorn actor actress address adventure afternoon air audience bag bandage barbecue bean beaver bill blossom board bone boots border boss bow breadstick brush bubble buffalo bun bunny cable café cafe canoe cap carnival cauliflower cellar centipede ceremony chain chalkboard cheesecake cheetah chess chestnut chin chipmunk chips chopsticks clothes clover comedy compass conductor coral cornfield crayon cricket cub daisy delivery dough doorknob doughnut drawer driveway dust envelope exit flashlight florist flu footprint fortune fossil fryingpan furniture gallery garbage garlic goose gooseberry gown guest guide hairpin hallway harp harvest hazelnut hedge highway hiker holiday horn hose hotdog hour hyena igloo invitation ivy jackal jazz jeep jellybean judge juggler ketchup land laptop lasagna lava lawyer lettuce librarian license lifeguard lightbulb lime locket lumber lunchbox lynx magazine magician manager marshmallow mechanic meat medicine memory menu mitten model mole mop motel muffin musician mustard nightingale nightstand ninja nurse office olive otter overalls owner painter pajamas pan panther parachute parking parsnip passenger patch pathway peacock pebbles pelican pencil pepperoni petal photocopier picture pilot pin platypus playground plumber poet polar portrait powder prawn president prize professor prune pudding puma purse pyramid quilt radish raft raisin raspberry receipt recorder referee rehearsal reindeer rhino risotto robber robin roller ruby sailor salmon sand sandbox sardine satin scale scarecrow science scientist scoreboard screen screwdriver sculpture secretary shadow shamrock sheet shepherd shovel sibling skateboard ski skull skunk slipper sloth smartphone smoothie snowshoe socket soldier speaker spinach sponge sports stadium stapler sticker stork straw student submarine suit sunglasses sunrise surfboard surgeon tailor tambourine tangerine tank tart temple tennis theater theatre thread thumb timber tissue toddler toolbox toothpaste torch tortoise translator trumpet tulip tuna typewriter uncle uniform vacation valet vanilla vest vet video walrus warehouse washingmachine wasp watch weather weasel weekday weekend wheat wheelchair wish wok woodpecker wool workshop wrist xylophone yak yam yarn zucchini accountant alligator applesauce badminton ballroom barista basement bedbug beehive binoculars blackboard blindfold blueberry bookmark bouncer bowtie boyfriend bride bridesmaid briefcase bubblegum butler campsite cardboard cardigan catfish chandelier charades chocolate clipboard clubhouse coaster coconut coleslaw cork corkscrew countertop courtyard cranberry crepe croissant cruise cucumber dandelion dishwasher doormat dragonfruit dumpling earplug earmuff eggplant elf escalator espresso eyelash family firefly fishbowl fishcake flatbread flowerpot fondue frost frosting garlicbread girlfriend glacier goldfish grandfather grandmother guacamole haircut handkerchief harmonica haystack headband headlight hibiscus honeydew honeymoon horseshoe houseboat hummingbird icicle jellyroll jewelry jigsaw joystick kneecap ladle landmark lavender leotard lifeboat limousine litter locksmith lookout lumberjack macaw manatee mandarin mansion marker marmalade mascara meadow meatball milkshake minibus moccasin mooncake motorboat mountainbike mulberry nachos newsstand oatmeal omelette origami ostrich overcoat parsley paw peppermint persimmon pigtail pomegranate poncho ponytail porcupine pretzel projector pufferfish pumpkinseed pushchair quiche racetrack raincoat ravioli redwood rhubarb riverbank rowboat sailboat sandal sandcastle satellite saxophone scallop seahorse seashell sesame shoebox sidecar snowdrop snowplow sorbet spatula speedboat spoonbill sprinkler starfruit stepladder stopwatch stovetop sundae sunhat suspenders swordfish tablecloth tadpole tapir tarantula teddybear thermometer thimble thunderstorm tiara tinsel toucan tracksuit tricycle truffle turntable tweezers ukulele violets waffle warthog waterslide windmill windshield woodchuck wristwatch yoyo""".split()))

# Prefer natural standalone words over run-together compounds.
POOL = [w for w in POOL if w not in {'swimmingpool','vacuumcleaner','washingmachine','fryingpan','garlicbread','mintchip','mountainbike','teddybear','facepaint','jellyroll','pumpkinseed'}]

# Kuwaiti Arabic Word Trap pool: everyday nouns with one common spelling, written without ال.
AR_POOL = list(dict.fromkeys("""
قطة كلب قمر شمس نجمة غيمة مطر بحر شاطئ رمل جبل صحراء نخلة وردة شجرة حديقة بيت مطبخ غرفة باب شباك سرير مخدة بطانية كرسي طاولة ساعة كاميرا مفتاح شنطة محفظة نظارة خاتم قلادة سوار حلق عطر مكياج روج كحل مشط صابون شامبو منشفة جوتي نعال جوارب قميص فستان عباية شيلة دشداشة غترة عقال بشت جاكيت قبعة شمسية سيارة باص طيارة قطار سفينة قارب يخت تكسي مطار فندق مستشفى مدرسة جامعة مكتبة متحف سينما مطعم مقهى سوق مول صيدلية بنك
أسد نمر فيل زرافة قرد حصان جمل بقرة خروف دجاجة بطة حمامة صقر بومة سمكة قرش دلفين حوت سلحفاة أرنب فأر ثعبان ضفدع فراشة نحلة نملة عنكبوت تمساح بطريق ديناصور تنين وحش شبح ساحر أميرة ملك ملكة قرصان كنز جزيرة قلعة قصر برج جسر نافورة شلال بركان كهف ثلج
ثلاجة فرن خلاط ابريق دلة فنجان كوب صحن ملعقة شوكة سكين قدر بيتزا شاورما فلافل سمبوسة مجبوس هريس لقيمات بلاليط مطبق كيكة عسل حليب قهوة شاي كرك عصير خبز جبن بيض معكرونة سلطة طماطم بصل ثوم جزر خيار ليمون برتقال تفاح موز فراولة بطيخ عنب أناناس رمان تمر فشار ذرة حمص
سماعة شاحن بطارية لابتوب ريموت حفلة عرس عروس عريس بالون شمعة هدية ديوانية شاليه كشتة خيمة سدو بخور مبخرة دكتور ممرضة شرطي طباخ مهندس معلم طيار مضيفة رسام مغني حلاق خياط عين أذن أنف شعر إصبع قلب
عاصفة رعد برق غبار طوز كتاب دفتر قلم ممحاة مسطرة رسالة ظرف خريطة بوصلة جواز تذكرة صورة لوحة تمثال كرة ملعب جائزة ميدالية كأس تاج عرش صاروخ فضاء كوكب روبوت مغناطيس بيانو طبل عود مسرح ستارة سلم مصعد حمام مسبح غسالة مكنسة مروحة مكيف ثريا سجادة كنب لؤلؤ غواص شبكة صنارة مرساة منارة سفينة
فيلا عمارة حارس ساعي مزرعة فلاح بستان زهرة ياسمين بخاخ مراوح شوال كيس صندوق علبة قنينة زجاجة مرطب بودرة أظافر شنب لحية ضحكة مفاجأة حلم كابوس سهرة رحلة إجازة جوال رصيف إشارة دوار شارع حديقة نادي صالون مغسلة فرشاة
""".split()))
