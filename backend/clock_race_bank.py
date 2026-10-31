"""Clock Race question bank: the picture-comparison family.

Four kinds:
  belong   أي واحد مختلف؟   four pictures, three share a category, tap the outsider
  older    أيهم أقدم؟       two pictures, tap the older (or the one that came first)
  compare  أيهم أثقل؟ ...   two pictures, tap the heavier / bigger / taller / faster / smaller
  which    أيهم؟            two pictures, a surprising factual comparison

Every option is (art key, Arabic name, English name). The FIRST option is always the right answer;
the server shuffles positions for every task. `art` keys map to illustration files listed in
frontend/src/components/clockRace/artManifest.js (missing art shows a painted placeholder card).

Each entry: id, kind, Arabic and English question, options, difficulty (e/m/h), a one-line fact
(never shown before the answer) and a source note. Animal sizes use typical healthy adults with a
wide margin; dates name the exact event compared.
"""

E, M, H = 'easy', 'medium', 'hard'

QUESTIONS = []


def q(qid, kind, ar, en, options, diff, fact, src):
    QUESTIONS.append(dict(id=qid, kind=kind, ar=ar, en=en, options=[list(o) for o in options],
                          difficulty=diff, fact=fact, source=src))


# ------------------------------------------------------------------ أي واحد مختلف؟ (35)
B = 'belong'
q('b01', B, 'أي واحد مو مصنوع من الرمل؟', 'Which one is not made from sand?',
  [('wooden_spoon', 'ملعقة خشب', 'Wooden spoon'), ('glass', 'زجاج', 'Glass'), ('concrete', 'خرسانة', 'Concrete'), ('silicon_chip', 'رقاقة سيليكون', 'Silicon chip')],
  M, 'Glass and silicon chips come from silica sand; concrete is sand, gravel and cement.', 'USGS sand & gravel overview')
q('b02', B, 'أي واحد مو من الثدييات؟', 'Which one is not a mammal?',
  [('penguin', 'بطريق', 'Penguin'), ('blue_whale', 'حوت', 'Whale'), ('bat', 'خفاش', 'Bat'), ('dolphin', 'دولفين', 'Dolphin')],
  E, 'Penguins are birds; whales, bats and dolphins are mammals.', 'Britannica: mammal')
q('b03', B, 'أي واحد مو فاكهة؟', 'Which one is not a fruit?',
  [('carrot', 'جزر', 'Carrot'), ('apple', 'تفاح', 'Apple'), ('mango', 'مانجو', 'Mango'), ('banana', 'موز', 'Banana')],
  E, 'A carrot is a root.', 'Britannica: carrot')
q('b04', B, 'أي واحد ما يطير؟', 'Which one can\'t fly?',
  [('penguin', 'بطريق', 'Penguin'), ('eagle', 'نسر', 'Eagle'), ('owl', 'بومة', 'Owl'), ('bat', 'خفاش', 'Bat')],
  E, 'Penguins are flightless; bats fly.', 'Britannica: penguin')
q('b05', B, 'أي واحد مو كوكب؟', 'Which one is not a planet?',
  [('moon', 'القمر', 'The Moon'), ('mars', 'المريخ', 'Mars'), ('saturn', 'زحل', 'Saturn'), ('venus', 'الزهرة', 'Venus')],
  E, 'The Moon is Earth\'s satellite.', 'NASA solar system')
q('b06', B, 'أي واحد مو طير؟', 'Which one is not a bird?',
  [('bat', 'خفاش', 'Bat'), ('ostrich', 'نعامة', 'Ostrich'), ('penguin', 'بطريق', 'Penguin'), ('eagle', 'نسر', 'Eagle')],
  M, 'Bats are mammals; ostriches and penguins are birds that cannot fly.', 'Britannica: bat')
q('b07', B, 'أي واحد مو حشرة؟', 'Which one is not an insect?',
  [('spider', 'عنكبوت', 'Spider'), ('ant', 'نملة', 'Ant'), ('bee', 'نحلة', 'Bee'), ('butterfly', 'فراشة', 'Butterfly')],
  M, 'Spiders have eight legs and are arachnids; insects have six.', 'Britannica: arachnid')
q('b08', B, 'أي واحد مو سمكة؟', 'Which one is not a fish?',
  [('dolphin', 'دولفين', 'Dolphin'), ('shark', 'قرش', 'Shark'), ('tuna', 'تونة', 'Tuna'), ('salmon', 'سلمون', 'Salmon')],
  E, 'Dolphins are mammals that breathe air.', 'Britannica: dolphin')
q('b09', B, 'أي واحد مو قارة؟', 'Which one is not a continent?',
  [('greenland', 'جرينلاند', 'Greenland'), ('asia', 'آسيا', 'Asia'), ('africa', 'أفريقيا', 'Africa'), ('europe', 'أوروبا', 'Europe')],
  E, 'Greenland is an island.', 'Britannica: Greenland')
q('b10', B, 'أي دولة مو في أفريقيا؟', 'Which country is not in Africa?',
  [('peru', 'بيرو', 'Peru'), ('egypt', 'مصر', 'Egypt'), ('kenya', 'كينيا', 'Kenya'), ('morocco', 'المغرب', 'Morocco')],
  E, 'Peru is in South America.', 'Britannica: Peru')
q('b11', B, 'أي دولة مو خليجية؟', 'Which one is not a Gulf (GCC) country?',
  [('jordan', 'الأردن', 'Jordan'), ('kuwait', 'الكويت', 'Kuwait'), ('oman', 'عُمان', 'Oman'), ('bahrain', 'البحرين', 'Bahrain')],
  E, 'The GCC is Kuwait, Saudi Arabia, Bahrain, Qatar, UAE and Oman.', 'GCC Secretariat')
q('b12', B, 'أي آلة ما فيها أوتار؟', 'Which instrument has no strings?',
  [('flute', 'ناي', 'Flute'), ('guitar', 'جيتار', 'Guitar'), ('violin', 'كمان', 'Violin'), ('oud', 'عود', 'Oud')],
  E, 'The flute is a wind instrument.', 'Britannica: flute')
q('b13', B, 'أي واحد مو من الزواحف؟', 'Which one is not a reptile?',
  [('frog', 'ضفدع', 'Frog'), ('snake', 'ثعبان', 'Snake'), ('crocodile', 'تمساح', 'Crocodile'), ('lizard', 'سحلية', 'Lizard')],
  M, 'Frogs are amphibians.', 'Britannica: amphibian')
q('b14', B, 'أي واحد مو معدن؟', 'Which one is not a metal?',
  [('glass', 'زجاج', 'Glass'), ('iron', 'حديد', 'Iron'), ('copper', 'نحاس', 'Copper'), ('gold', 'ذهب', 'Gold')],
  E, 'Glass is made from sand.', 'Britannica: glass')
q('b15', B, 'أي واحد مو من مشتقات الحليب؟', 'Which one is not made from milk?',
  [('eggs', 'بيض', 'Eggs'), ('cheese', 'جبن', 'Cheese'), ('yogurt', 'روب', 'Yogurt'), ('butter', 'زبدة', 'Butter')],
  E, 'Eggs come from hens, not milk.', 'USDA dairy group')
q('b16', B, 'أي واحد مو حمضيات؟', 'Which one is not a citrus fruit?',
  [('apple', 'تفاح', 'Apple'), ('orange', 'برتقال', 'Orange'), ('lemon', 'ليمون', 'Lemon'), ('lime', 'لومي', 'Lime')],
  E, 'Apples are pome fruits, not citrus.', 'Britannica: citrus')
q('b17', B, 'أي مدينة مو عاصمة دولة؟', 'Which city is not a country\'s capital?',
  [('dubai', 'دبي', 'Dubai'), ('paris', 'باريس', 'Paris'), ('tokyo', 'طوكيو', 'Tokyo'), ('cairo', 'القاهرة', 'Cairo')],
  M, 'Abu Dhabi is the UAE capital, not Dubai.', 'UAE government portal')
q('b18', B, 'أي واحد مو محيط؟', 'Which one is not an ocean?',
  [('mediterranean', 'البحر المتوسط', 'Mediterranean'), ('pacific', 'الهادئ', 'Pacific'), ('atlantic', 'الأطلسي', 'Atlantic'), ('indian_ocean', 'الهندي', 'Indian Ocean')],
  M, 'The Mediterranean is a sea.', 'NOAA: oceans')
q('b19', B, 'أي واحد مو غاز؟', 'Which one is not a gas?',
  [('mercury', 'زئبق', 'Mercury'), ('oxygen', 'أكسجين', 'Oxygen'), ('helium', 'هيليوم', 'Helium'), ('nitrogen', 'نيتروجين', 'Nitrogen')],
  M, 'Mercury is a liquid metal at room temperature.', 'Royal Society of Chemistry')
q('b20', B, 'أي واحد ما يبيض؟', 'Which one doesn\'t lay eggs?',
  [('cow', 'بقرة', 'Cow'), ('chicken', 'دجاجة', 'Chicken'), ('crocodile', 'تمساح', 'Crocodile'), ('turtle', 'سلحفاة', 'Turtle')],
  E, 'Cows give birth to live calves.', 'Britannica: cattle')
q('b21', B, 'أي رياضة مو شتوية؟', 'Which sport is not a winter sport?',
  [('surfing', 'ركوب الأمواج', 'Surfing'), ('skiing', 'تزلج', 'Skiing'), ('ice_hockey', 'هوكي الجليد', 'Ice hockey'), ('snowboard', 'سنوبورد', 'Snowboarding')],
  E, 'Surfing is done on ocean waves.', 'Olympic winter programme')
q('b22', B, 'أي لعبة ما فيها كورة؟', 'Which game has no ball?',
  [('chess', 'شطرنج', 'Chess'), ('football', 'كرة قدم', 'Football'), ('tennis', 'تنس', 'Tennis'), ('basketball', 'كرة سلة', 'Basketball')],
  E, 'Chess is a board game.', 'FIDE')
q('b23', B, 'أي واحد مو من أدوات المطبخ؟', 'Which one is not a kitchen tool?',
  [('hammer', 'شاكوش', 'Hammer'), ('whisk', 'خفاقة', 'Whisk'), ('ladle', 'مغرفة', 'Ladle'), ('spatula', 'مِقلَب', 'Spatula')],
  E, 'A hammer is a carpentry tool.', '-')
q('b24', B, 'أي شكل ما له زوايا؟', 'Which shape has no corners?',
  [('circle', 'دائرة', 'Circle'), ('square', 'مربع', 'Square'), ('triangle', 'مثلث', 'Triangle'), ('rectangle', 'مستطيل', 'Rectangle')],
  E, 'A circle has no corners.', '-')
q('b25', B, 'أي حيوان ياكل لحم؟', 'Which animal eats meat?',
  [('lion', 'أسد', 'Lion'), ('cow', 'بقرة', 'Cow'), ('giraffe', 'زرافة', 'Giraffe'), ('rabbit', 'أرنب', 'Rabbit')],
  E, 'Lions are carnivores; the others eat plants.', 'Britannica: lion')
q('b26', B, 'أي واحد مو من فصيلة القطط؟', 'Which one is not a big cat?',
  [('hyena', 'ضبع', 'Hyena'), ('tiger', 'نمر', 'Tiger'), ('lion', 'أسد', 'Lion'), ('leopard', 'فهد', 'Leopard')],
  H, 'Hyenas are their own family, closer to mongooses than to cats.', 'Britannica: hyena')
q('b27', B, 'أي واحد مو صحراء؟', 'Which one is not a desert?',
  [('amazon', 'الأمازون', 'Amazon'), ('sahara', 'الصحراء الكبرى', 'Sahara'), ('gobi', 'جوبي', 'Gobi'), ('empty_quarter', 'الربع الخالي', 'Empty Quarter')],
  E, 'The Amazon is a rainforest.', 'Britannica: Amazon rainforest')
q('b28', B, 'أي واحد ما يعيش في البحر؟', 'Which one doesn\'t live in the sea?',
  [('camel', 'جمل', 'Camel'), ('octopus', 'أخطبوط', 'Octopus'), ('jellyfish', 'قنديل البحر', 'Jellyfish'), ('starfish', 'نجمة البحر', 'Starfish')],
  E, 'Camels live in deserts.', '-')
q('b29', B, 'أي واحد مو عضو داخلي؟', 'Which one is not an internal organ?',
  [('elbow', 'كوع', 'Elbow'), ('heart', 'قلب', 'Heart'), ('lungs', 'رئة', 'Lungs'), ('liver', 'كبد', 'Liver')],
  E, 'The elbow is a joint.', 'NIH MedlinePlus')
q('b30', B, 'أي واحد مو معكرونة؟', 'Which one is not pasta?',
  [('rice', 'رز', 'Rice'), ('spaghetti', 'سباغيتي', 'Spaghetti'), ('penne', 'بيني', 'Penne'), ('macaroni', 'مكرونة', 'Macaroni')],
  E, 'Rice is a grain, not a dough.', '-')
q('b31', B, 'أي واحد مو حلى؟', 'Which one is not a dessert?',
  [('hummus', 'حمص', 'Hummus'), ('baklava', 'بقلاوة', 'Baklava'), ('kunafa', 'كنافة', 'Kunafa'), ('luqaimat', 'لقيمات', 'Luqaimat')],
  E, 'Hummus is a savoury dip.', '-')
q('b32', B, 'أي واحد ما يقيس الوقت؟', 'Which one doesn\'t tell time?',
  [('compass', 'بوصلة', 'Compass'), ('clock', 'ساعة', 'Clock'), ('hourglass', 'ساعة رملية', 'Hourglass'), ('sundial', 'مزولة', 'Sundial')],
  E, 'A compass shows direction.', '-')
q('b33', B, 'أي واحد ما عنده كفرات؟', 'Which one has no wheels?',
  [('boat', 'قارب', 'Boat'), ('car', 'سيارة', 'Car'), ('bicycle', 'سيكل', 'Bicycle'), ('bus', 'باص', 'Bus')],
  E, 'Boats float.', '-')
q('b34', B, 'أي واحد ما ينلبس في الرجل؟', 'Which one isn\'t worn on the feet?',
  [('glove', 'جوانتي', 'Glove'), ('sandal', 'نعال', 'Sandal'), ('boot', 'بوت', 'Boot'), ('sneaker', 'جوتي', 'Sneaker')],
  E, 'Gloves go on hands.', '-')
q('b35', B, 'أي واحد مو عنصر كيميائي؟', 'Which one is not a chemical element?',
  [('water', 'ماي', 'Water'), ('gold', 'ذهب', 'Gold'), ('oxygen', 'أكسجين', 'Oxygen'), ('iron', 'حديد', 'Iron')],
  M, 'Water is a compound of hydrogen and oxygen.', 'IUPAC periodic table')

# ------------------------------------------------------------------ أيهم أقدم؟ (30)
O = 'older'
OLD_AR, OLD_EN = 'أيهم أقدم؟', 'Which is older?'
FIRST_AR, FIRST_EN = 'أيهم صار أول؟', 'Which came first?'
q('o01', O, OLD_AR, OLD_EN, [('betty_white', 'بيتي وايت (مواليد ١٩٢٢)', 'Betty White (born)'), ('sliced_bread', 'الخبز المقطّع للبيع', 'Sliced bread on sale')],
  H, 'Betty White was born in Jan 1922; sliced bread was first sold in July 1928.', 'Britannica: Betty White; Smithsonian: sliced bread 1928')
q('o02', O, OLD_AR, OLD_EN, [('nintendo', 'شركة نينتندو', 'Nintendo (company)'), ('titanic', 'سفينة تايتانك', 'The Titanic')],
  H, 'Nintendo was founded in 1889 as a card maker; Titanic launched in 1911.', 'Nintendo corporate history; Britannica: Titanic')
q('o03', O, OLD_AR, OLD_EN, [('oxford', 'جامعة أكسفورد', 'Oxford University'), ('aztec', 'إمبراطورية الأزتك', 'The Aztec Empire')],
  H, 'Teaching at Oxford existed by 1096; the Aztec Triple Alliance formed in 1428.', 'University of Oxford history; Britannica: Aztec')
q('o04', O, OLD_AR, OLD_EN, [('cola', 'كوكاكولا', 'Coca-Cola'), ('eiffel', 'برج إيفل', 'The Eiffel Tower')],
  M, 'Coca-Cola was first sold in 1886; the Eiffel Tower opened in 1889.', 'Coca-Cola company history; Britannica: Eiffel Tower')
q('o05', O, OLD_AR, OLD_EN, [('youtube', 'يوتيوب', 'YouTube'), ('iphone', 'أول آيفون', 'The first iPhone')],
  M, 'YouTube launched in 2005; the iPhone came out in 2007.', 'Britannica: YouTube; Apple press release 2007')
q('o06', O, OLD_AR, OLD_EN, [('harry_potter', 'أول كتاب هاري بوتر', 'First Harry Potter book'), ('google', 'جوجل', 'Google')],
  M, 'The first book came out in June 1997; Google was founded in Sept 1998.', 'Bloomsbury; Google company history')
q('o07', O, OLD_AR, OLD_EN, [('shark', 'أسماك القرش', 'Sharks'), ('tree', 'الأشجار', 'Trees')],
  H, 'Sharks appeared about 450 million years ago; the first trees about 385 million.', 'Natural History Museum London')
q('o08', O, FIRST_AR, FIRST_EN, [('pyramid', 'بناء الهرم الأكبر', 'Building the Great Pyramid'), ('mammoth', 'انقراض الماموث', 'Mammoths going extinct')],
  H, 'The Great Pyramid was built around 2560 BC; the last mammoths lived on Wrangel Island until about 2000 BC.', 'Britannica: Great Pyramid; Nature (Vartanyan 1993)')
q('o09', O, FIRST_AR, FIRST_EN, [('fax', 'جهاز الفاكس', 'The fax machine'), ('telephone', 'التلفون', 'The telephone')],
  H, 'Alexander Bain patented a fax in 1843; Bell\'s telephone patent was 1876.', 'Britannica: fax; Britannica: telephone')
q('o10', O, OLD_AR, OLD_EN, [('lego', 'شركة ليغو', 'LEGO (company)'), ('barbie', 'باربي', 'Barbie')],
  M, 'LEGO was founded in 1932; Barbie launched in 1959.', 'LEGO history; Mattel')
q('o11', O, OLD_AR, OLD_EN, [('rubik', 'مكعب روبيك', 'Rubik\'s Cube'), ('arcade', 'لعبة باك مان', 'Pac-Man')],
  M, 'The Rubik\'s Cube was invented in 1974; Pac-Man came out in 1980.', 'Britannica: Rubik\'s Cube; Bandai Namco')
q('o12', O, OLD_AR, OLD_EN, [('burger', 'ماكدونالدز', 'McDonald\'s'), ('castle', 'ديزني لاند', 'Disneyland')],
  M, 'The first McDonald\'s opened in 1940; Disneyland opened in 1955.', 'McDonald\'s history; Disney')
q('o13', O, OLD_AR, OLD_EN, [('facebook', 'فيسبوك', 'Facebook'), ('twitter', 'تويتر', 'Twitter')],
  E, 'Facebook launched in 2004; Twitter in 2006.', 'Britannica')
q('o14', O, OLD_AR, OLD_EN, [('whatsapp', 'واتساب', 'WhatsApp'), ('instagram', 'إنستغرام', 'Instagram')],
  M, 'WhatsApp launched in 2009; Instagram in 2010.', 'Britannica')
q('o15', O, OLD_AR, OLD_EN, [('playstation', 'بلايستيشن', 'PlayStation'), ('google', 'جوجل', 'Google')],
  M, 'PlayStation came out in Japan in Dec 1994; Google was founded in 1998.', 'Sony Interactive history')
q('o16', O, OLD_AR, OLD_EN, [('kuwait_towers', 'أبراج الكويت', 'Kuwait Towers'), ('burj_al_arab', 'برج العرب', 'Burj Al Arab')],
  E, 'Kuwait Towers opened in 1979; Burj Al Arab in 1999.', 'Kuwait Towers official; Jumeirah')
q('o17', O, OLD_AR, OLD_EN, [('iphone', 'أول آيفون', 'The first iPhone'), ('burj_khalifa', 'برج خليفة', 'Burj Khalifa')],
  M, 'The iPhone came out in 2007; Burj Khalifa opened in 2010.', 'Apple; Emaar')
q('o18', O, FIRST_AR, FIRST_EN, [('lighter', 'الولاعة', 'The lighter'), ('matches', 'أعواد الكبريت', 'Friction matches')],
  H, 'Döbereiner\'s lighter dates from 1823; John Walker sold friction matches from 1827.', 'Britannica: match; Science Museum: Döbereiner\'s lamp')
q('o19', O, OLD_AR, OLD_EN, [('monopoly', 'لعبة مونوبولي', 'Monopoly'), ('scrabble', 'لعبة سكرابل', 'Scrabble')],
  M, 'Parker Brothers released Monopoly in 1935; Scrabble came out in 1948.', 'Hasbro')
q('o20', O, OLD_AR, OLD_EN, [('amazon_box', 'أمازون', 'Amazon'), ('google', 'جوجل', 'Google')],
  M, 'Amazon was founded in 1994; Google in 1998.', 'Britannica')
q('o21', O, OLD_AR, OLD_EN, [('microsoft', 'مايكروسوفت', 'Microsoft'), ('apple_co', 'شركة آبل', 'Apple (company)')],
  M, 'Microsoft was founded in April 1975; Apple in April 1976.', 'Britannica')
q('o22', O, OLD_AR, OLD_EN, [('samsung', 'سامسونج', 'Samsung'), ('sony', 'سوني', 'Sony')],
  H, 'Samsung was founded in 1938; Sony in 1946.', 'Samsung history; Sony history')
q('o23', O, OLD_AR, OLD_EN, [('kitkat', 'كيت كات', 'Kit Kat'), ('mms', 'إم آند إمز', 'M&M\'s')],
  H, 'Kit Kat launched in 1935; M&M\'s in 1941.', 'Nestlé; Mars')
q('o24', O, FIRST_AR, FIRST_EN, [('printing_press', 'مطبعة جوتنبرج', 'Gutenberg\'s printing press'), ('mona_lisa', 'لوحة الموناليزا', 'The Mona Lisa')],
  M, 'Gutenberg printed around 1440-1455; the Mona Lisa was begun about 1503.', 'Britannica')
q('o25', O, OLD_AR, OLD_EN, [('kuwait_airways', 'الخطوط الكويتية', 'Kuwait Airways'), ('emirates', 'طيران الإمارات', 'Emirates')],
  M, 'Kuwait Airways began in 1954; Emirates in 1985.', 'Kuwait Airways; Emirates Group')
q('o26', O, OLD_AR, OLD_EN, [('stegosaurus', 'ستيجوسورس', 'Stegosaurus'), ('trex', 'تي ركس', 'T. rex')],
  H, 'Stegosaurus lived about 150 million years ago; T. rex about 68 million.', 'Natural History Museum London')
q('o27', O, OLD_AR, OLD_EN, [('light_bulb', 'مصباح أديسون', 'Edison\'s light bulb'), ('cola', 'كوكاكولا', 'Coca-Cola')],
  H, 'Edison\'s bulb was demonstrated in 1879; Coca-Cola was first sold in 1886.', 'Britannica')
q('o28', O, OLD_AR, OLD_EN, [('pizza_hut', 'بيتزا هت', 'Pizza Hut'), ('dominos', 'دومينوز', 'Domino\'s')],
  H, 'Pizza Hut opened in 1958; Domino\'s in 1960.', 'Company histories')
q('o29', O, OLD_AR, OLD_EN, [('netflix', 'نتفليكس', 'Netflix'), ('google', 'جوجل', 'Google')],
  H, 'Netflix was founded in Aug 1997; Google in Sept 1998.', 'Netflix; Google')
q('o30', O, OLD_AR, OLD_EN, [('pet_cat', 'القطط الأليفة', 'Pet cats'), ('pyramid', 'الأهرامات', 'The pyramids')],
  H, 'A cat buried with a person in Cyprus is about 9,500 years old; the pyramids are about 4,500.', 'Science (Vigne et al. 2004)')

# ------------------------------------------------------------------ أيهم أثقل / أكبر / أطول / أسرع / أصغر؟ (30)
C = 'compare'
HEAVY_AR, HEAVY_EN = 'أيهم أثقل؟', 'Which is heavier?'
BIG_AR, BIG_EN = 'أيهم أكبر؟', 'Which is bigger?'
TALL_AR, TALL_EN = 'أيهم أطول؟', 'Which is taller?'
FAST_AR, FAST_EN = 'أيهم أسرع؟', 'Which is faster?'
SMALL_AR, SMALL_EN = 'أيهم أصغر؟', 'Which is smaller?'
q('c01', C, HEAVY_AR, HEAVY_EN, [('blue_whale', 'الحوت الأزرق', 'Blue whale'), ('grizzly', 'دب أشهب', 'Grizzly bear')], E, 'Blue whales weigh over 100 tonnes; grizzlies about 0.3.', 'NOAA Fisheries')
q('c02', C, HEAVY_AR, HEAVY_EN, [('elephant', 'فيل أفريقي', 'African elephant'), ('hippo', 'فرس النهر', 'Hippo')], M, 'About 6 tonnes vs about 1.5.', 'Smithsonian\'s National Zoo')
q('c03', C, HEAVY_AR, HEAVY_EN, [('giraffe', 'زرافة', 'Giraffe'), ('lion', 'أسد', 'Lion')], M, 'Adult giraffes weigh about 800-1,200 kg; lions about 190.', 'Smithsonian\'s National Zoo')
q('c04', C, HEAVY_AR, HEAVY_EN, [('bowling_ball', 'كورة بولنج', 'Bowling ball'), ('basketball', 'كورة سلة', 'Basketball')], E, 'Up to 7 kg vs about 0.6 kg.', 'USBC; FIBA rules')
q('c05', C, HEAVY_AR, HEAVY_EN, [('ostrich', 'نعامة', 'Ostrich'), ('eagle', 'نسر', 'Eagle')], E, 'About 100 kg vs about 5 kg.', 'San Diego Zoo')
q('c06', C, HEAVY_AR, HEAVY_EN, [('polar_bear', 'دب قطبي', 'Polar bear'), ('gorilla', 'غوريلا', 'Gorilla')], M, 'About 450 kg vs about 160 kg (males).', 'WWF')
q('c07', C, HEAVY_AR, HEAVY_EN, [('camel', 'جمل', 'Camel'), ('donkey', 'حمار', 'Donkey')], E, 'About 500 kg vs about 200 kg.', 'Britannica')
q('c08', C, HEAVY_AR, HEAVY_EN, [('brick', 'طابوقة', 'A brick'), ('football', 'كورة قدم', 'A football')], E, 'About 2.5 kg vs 0.43 kg.', 'FIFA Laws of the Game')
q('c09', C, HEAVY_AR, HEAVY_EN, [('elephant', 'فيل أفريقي', 'African elephant'), ('car', 'سيارة صغيرة', 'A small car')], M, 'About 6,000 kg vs about 1,200 kg.', 'Smithsonian\'s National Zoo')
q('c10', C, BIG_AR, BIG_EN, [('sun', 'الشمس', 'The Sun'), ('earth', 'الأرض', 'Earth')], E, 'About 109 Earths fit across the Sun.', 'NASA')
q('c11', C, BIG_AR, BIG_EN, [('jupiter', 'المشتري', 'Jupiter'), ('earth', 'الأرض', 'Earth')], E, 'Jupiter is about 11 times wider.', 'NASA')
q('c12', C, TALL_AR, TALL_EN, [('giraffe', 'زرافة', 'Giraffe'), ('elephant', 'فيل', 'Elephant')], E, 'About 5 m vs about 3 m.', 'San Diego Zoo')
q('c13', C, TALL_AR, TALL_EN, [('burj_khalifa', 'برج خليفة', 'Burj Khalifa'), ('eiffel', 'برج إيفل', 'Eiffel Tower')], E, '828 m vs 330 m.', 'CTBUH')
q('c14', C, FAST_AR, FAST_EN, [('falcon', 'صقر شاهين (وهو ينقض)', 'Peregrine falcon (diving)'), ('cheetah', 'فهد صياد', 'Cheetah')], M, 'Over 300 km/h in a dive vs about 110 km/h.', 'Audubon; Smithsonian')
q('c15', C, SMALL_AR, SMALL_EN, [('hummingbird', 'طائر الطنان', 'Hummingbird'), ('sparrow', 'عصفور', 'Sparrow')], E, 'About 3-4 g vs about 30 g.', 'Audubon')
q('c16', C, SMALL_AR, SMALL_EN, [('bahrain', 'البحرين', 'Bahrain'), ('kuwait', 'الكويت', 'Kuwait')], M, 'About 780 km² vs about 17,800 km².', 'CIA World Factbook')
q('c17', C, BIG_AR, BIG_EN, [('saudi', 'السعودية', 'Saudi Arabia'), ('egypt', 'مصر', 'Egypt')], M, 'About 2.15 million km² vs about 1.0 million.', 'CIA World Factbook')
q('c18', C, BIG_AR, BIG_EN, [('australia', 'أستراليا', 'Australia'), ('india', 'الهند', 'India')], M, 'About 7.7 million km² vs about 3.3 million.', 'CIA World Factbook')
q('c19', C, HEAVY_AR, HEAVY_EN, [('watermelon', 'جحة', 'Watermelon'), ('pineapple', 'أناناس', 'Pineapple')], E, 'Usually 5-9 kg vs 1-2 kg.', 'USDA')
q('c20', C, 'أيهم أثقل: لتر ماي ولا لتر زيت؟', 'Which is heavier: a litre of water or of oil?', [('water', 'لتر ماي', 'A litre of water'), ('oil', 'لتر زيت', 'A litre of oil')], H, 'Oil is less dense than water (it floats).', 'Britannica: density')
q('c21', C, HEAVY_AR, HEAVY_EN, [('emperor_penguin', 'بطريق إمبراطور', 'Emperor penguin'), ('house_cat', 'قطوة', 'House cat')], M, 'About 23-40 kg vs about 4 kg.', 'British Antarctic Survey')
q('c22', C, BIG_AR, BIG_EN, [('basketball', 'كورة سلة', 'Basketball'), ('football', 'كورة قدم', 'Football')], M, 'Size 7 basketball is about 24 cm across; size 5 football about 22 cm.', 'FIBA; FIFA')
q('c23', C, TALL_AR, TALL_EN, [('eiffel', 'برج إيفل', 'Eiffel Tower'), ('kuwait_towers', 'أبراج الكويت', 'Kuwait Towers')], M, '330 m vs 187 m.', 'CTBUH')
q('c24', C, FAST_AR, FAST_EN, [('light', 'الضوء', 'Light'), ('sound', 'الصوت', 'Sound')], E, 'About 300,000 km/s vs 0.34 km/s.', 'NIST')
q('c25', C, 'أيهم أثقل: مخ الإنسان ولا قلبه؟', 'Which is heavier: the human brain or heart?', [('brain', 'المخ', 'Brain'), ('heart', 'القلب', 'Heart')], H, 'About 1.4 kg vs about 0.3 kg.', 'NIH')
q('c26', C, SMALL_AR, SMALL_EN, [('pluto', 'بلوتو', 'Pluto'), ('moon', 'القمر', 'The Moon')], H, 'Pluto is about 2,377 km across; the Moon 3,474 km.', 'NASA')
q('c27', C, HEAVY_AR, HEAVY_EN, [('rhino', 'وحيد القرن', 'Rhino'), ('giraffe', 'زرافة', 'Giraffe')], H, 'White rhinos weigh about 2,000 kg; giraffes about 1,000.', 'WWF; San Diego Zoo')
q('c28', C, BIG_AR, BIG_EN, [('pacific', 'المحيط الهادئ', 'Pacific Ocean'), ('atlantic', 'المحيط الأطلسي', 'Atlantic Ocean')], E, 'The Pacific is about twice the Atlantic.', 'NOAA')
q('c29', C, TALL_AR, TALL_EN, [('everest', 'إيفرست', 'Mount Everest'), ('k2', 'كيه ٢', 'K2')], M, '8,849 m vs 8,611 m.', 'National Geographic')
q('c30', C, FAST_AR, FAST_EN, [('kangaroo', 'كنغر', 'Kangaroo'), ('sprinter', 'أسرع عدّاء بالعالم', 'World\'s fastest sprinter')], M, 'About 70 km/h vs about 44 km/h.', 'Australian Museum; World Athletics')

# ------------------------------------------------------------------ أيهم؟ (25)
W = 'which'
q('w01', W, 'أيهم أسرع بالركض؟', 'Which runs faster (top speed)?', [('cheetah', 'فهد صياد', 'Cheetah'), ('horse', 'حصان', 'Horse')], E, 'About 110 km/h vs about 70 km/h.', 'Smithsonian')
q('w02', W, 'أيهم أبعد عن الشمس؟', 'Which is farther from the Sun?', [('mars', 'المريخ', 'Mars'), ('venus', 'الزهرة', 'Venus')], E, 'Mars is the 4th planet, Venus the 2nd.', 'NASA')
q('w03', W, 'أيهم فيه عظام أكثر؟', 'Which has more bones?', [('human', 'الإنسان', 'An adult human'), ('shark', 'القرش', 'A shark')], M, 'Sharks have cartilage, no bones.', 'NOAA')
q('w04', W, 'أيهم عنده رجول أكثر؟', 'Which has more legs?', [('spider', 'عنكبوت', 'Spider'), ('ant', 'نملة', 'Ant')], E, 'Eight vs six.', 'Britannica')
q('w05', W, 'أيهم فيه كافيين أكثر؟', 'Which has more caffeine?', [('coffee_cup', 'كوب قهوة عادي', 'A cup of brewed coffee'), ('espresso', 'شوت إسبريسو', 'One espresso shot')], H, 'About 95 mg in a cup vs about 63 mg in a shot.', 'USDA FoodData Central')
q('w06', W, 'أيهم طلع أول؟', 'Which came out first?', [('instagram', 'إنستغرام', 'Instagram'), ('snapchat', 'سناب شات', 'Snapchat')], M, 'Instagram Oct 2010; Snapchat 2011.', 'Britannica')
q('w07', W, 'أيهم أحر؟', 'Which is hotter?', [('venus', 'الزهرة', 'Venus'), ('mercury_planet', 'عطارد', 'Mercury')], H, 'Venus\'s thick air traps heat: about 465°C; Mercury peaks around 430°C.', 'NASA')
q('w08', W, 'أيهم عنده قلوب أكثر؟', 'Which has more hearts?', [('octopus', 'أخطبوط', 'Octopus'), ('human', 'إنسان', 'Human')], M, 'An octopus has three hearts.', 'Smithsonian Ocean')
q('w09', W, 'أيهم يعيش أطول؟', 'Which lives longer?', [('tortoise', 'سلحفاة عملاقة', 'Giant tortoise'), ('elephant', 'فيل', 'Elephant')], M, 'Giant tortoises often pass 100; elephants about 60-70.', 'Galápagos Conservancy')
q('w10', W, 'أيهم عنده أسنان أكثر؟', 'Which has more teeth?', [('dog', 'كلب', 'Adult dog'), ('human', 'إنسان', 'Adult human')], M, '42 vs 32.', 'AVMA')
q('w11', W, 'أيهم أبرد؟', 'Which is colder?', [('south_pole', 'القطب الجنوبي', 'South Pole'), ('north_pole', 'القطب الشمالي', 'North Pole')], M, 'The South Pole sits on a high ice sheet; the North Pole is on sea ice.', 'NSIDC')
q('w12', W, 'أيهم سكانه أكثر؟', 'Which has more people?', [('kuwait', 'الكويت', 'Kuwait'), ('bahrain', 'البحرين', 'Bahrain')], E, 'About 4.9 million vs about 1.6 million.', 'UN population data')
q('w13', W, 'أيهم عنده أقمار أكثر؟', 'Which has more moons?', [('mars', 'المريخ', 'Mars'), ('earth', 'الأرض', 'Earth')], M, 'Mars has two (Phobos, Deimos).', 'NASA')
q('w14', W, 'أيهم ينام أكثر؟', 'Which sleeps more?', [('koala', 'كوالا', 'Koala'), ('human', 'إنسان', 'Human')], E, 'Koalas sleep about 18-22 hours a day.', 'Australian Koala Foundation')
q('w15', W, 'عند النعامة أيهم أكبر؟', 'In an ostrich, which is bigger?', [('ostrich_eye', 'عينها', 'Its eye'), ('ostrich_brain', 'مخها', 'Its brain')], H, 'An ostrich eye is bigger than its brain.', 'San Diego Zoo')
q('w16', W, 'أيهم أقرب للكويت؟', 'Which is closer to Kuwait?', [('dubai', 'دبي', 'Dubai'), ('cairo', 'القاهرة', 'Cairo')], M, 'About 850 km vs about 1,600 km.', 'Great-circle distance')
q('w17', W, 'أيهم فيها دول أكثر؟', 'Which has more countries?', [('africa', 'أفريقيا', 'Africa'), ('europe', 'أوروبا', 'Europe')], M, '54 vs about 44.', 'UN member states')
q('w18', W, 'أيهم أملح؟', 'Which is saltier?', [('dead_sea', 'البحر الميت', 'Dead Sea'), ('gulf', 'الخليج العربي', 'Arabian Gulf')], E, 'About 34% salt vs about 4%.', 'Britannica: Dead Sea')
q('w19', W, 'أيهم سنته أطول؟', 'Which has the longer year?', [('mars', 'المريخ', 'Mars'), ('earth', 'الأرض', 'Earth')], E, '687 days vs 365.', 'NASA')
q('w20', W, 'أيهم أثقل؟', 'Which is heavier?', [('water', 'لتر ماي', 'A litre of water'), ('ice', 'لتر ثلج', 'A litre of ice')], H, 'Ice is less dense than water; that is why it floats.', 'USGS Water Science')
q('w21', W, 'أيهم يومه أطول؟', 'Which has the longer day?', [('venus', 'الزهرة', 'Venus'), ('earth', 'الأرض', 'Earth')], H, 'Venus spins once every 243 Earth days.', 'NASA')
q('w22', W, 'أيهم أسرع بالركض؟', 'Which runs faster?', [('ostrich', 'نعامة', 'Ostrich'), ('sprinter', 'أسرع عدّاء بالعالم', 'World\'s fastest sprinter')], M, 'About 70 km/h vs about 44 km/h.', 'San Diego Zoo; World Athletics')
q('w23', W, 'أيهم قلبه أكبر؟', 'Which has the bigger heart?', [('blue_whale', 'الحوت الأزرق', 'Blue whale'), ('elephant', 'فيل', 'Elephant')], E, 'A blue whale heart weighs about 180 kg.', 'Royal Ontario Museum')
q('w24', W, 'أيهم حروفه أكثر؟', 'Which alphabet has more letters?', [('arabic_letters', 'الأبجدية العربية', 'Arabic alphabet'), ('english_letters', 'الأبجدية الإنجليزية', 'English alphabet')], E, '28 vs 26.', '-')
q('w25', W, 'أيهم انخترع أول؟', 'Which was invented first?', [('telephone', 'التلفون', 'The telephone'), ('light_bulb', 'المصباح الكهربائي', 'Edison\'s light bulb')], M, '1876 vs 1879.', 'Britannica')

# ------------------------------------------------------------------ وين الحيوان؟ (animal identification)
ANIMALS = [
    ('lion', 'أسد', 'lion'), ('giraffe', 'زرافة', 'giraffe'), ('elephant', 'فيل', 'elephant'), ('camel', 'جمل', 'camel'),
    ('penguin', 'بطريق', 'penguin'), ('owl', 'بومة', 'owl'), ('octopus', 'أخطبوط', 'octopus'), ('koala', 'كوالا', 'koala'),
    ('kangaroo', 'كنغر', 'kangaroo'), ('hippo', 'فرس النهر', 'hippo'), ('rhino', 'وحيد القرن', 'rhino'), ('tiger', 'نمر', 'tiger'),
    ('hyena', 'ضبع', 'hyena'), ('ostrich', 'نعامة', 'ostrich'), ('frog', 'ضفدع', 'frog'), ('turtle', 'سلحفاة', 'turtle'),
    ('dolphin', 'دولفين', 'dolphin'), ('bat', 'خفاش', 'bat'), ('cheetah', 'فهد صياد', 'cheetah'), ('gorilla', 'غوريلا', 'gorilla'),
]

KINDS = ('belong', 'older', 'compare', 'which')
BY_KIND = {k: [x for x in QUESTIONS if x['kind'] == k] for k in KINDS}
BY_ID = {x['id']: x for x in QUESTIONS}


def art_keys():
    """Every illustration the bank asks for."""
    keys = {o[0] for x in QUESTIONS for o in x['options']}
    keys |= {a[0] for a in ANIMALS}
    return sorted(keys)
