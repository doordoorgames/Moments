"""Word Trap category bank.

Every round of Word Trap draws one category. All players' secret words come from it,
and everyone is told the category (never each other's words). Words are single
everyday nouns; Arabic words are written without ال (the matcher accepts ال and
attached و ف ب ك ل on its own).
"""

def _w(text):
    return list(dict.fromkeys(text.split()))

CATEGORIES = [
    dict(id='water',
         en=dict(name='Water', words=_w("""oyster shell ocean wave beach boat fish shark dolphin whale swimming pool
             rain river lake waterfall fountain bottle ice cup bath shower sink tap island sailor anchor pearl
             diver crab jellyfish octopus seaweed surf fishing harbor puddle umbrella towel splash""")),
         ar=dict(name='الماي', words=_w("""محار صدفة بحر موجة شاطئ قارب سمكة قرش دلفين حوت مسبح مطر نهر بحيرة شلال
             نافورة قنينة ثلج كوب حمام دوش مغسلة حنفية جزيرة بحار مرساة لؤلؤ غواص قبقب أخطبوط يخت صنارة
             منشفة شمسية سباحة غوص"""))),
    dict(id='nature',
         en=dict(name='Nature', words=_w("""tree forest flower leaf grass mountain river rock sun moon star cloud rain
             wind snow desert sand garden bird butterfly bee mushroom rainbow volcano cave jungle lake seed
             branch sunset valley hill palm rose storm thunder""")),
         ar=dict(name='الطبيعة', words=_w("""شجرة غابة وردة ورقة عشب جبل نهر صخرة شمس قمر نجمة غيمة مطر هوا ثلج
             صحراء رمل حديقة طير فراشة نحلة فطر بركان كهف بحيرة بذرة غصن غروب وادي تلة نخلة عاصفة رعد
             برق"""))),
    dict(id='technology',
         en=dict(name='Technology', words=_w("""phone laptop computer keyboard mouse screen charger battery camera
             robot wifi internet password email app game headphones speaker printer tablet remote cable
             satellite rocket drone video selfie website download notification bluetooth microphone television
             calculator code""")),
         ar=dict(name='التكنولوجيا', words=_w("""تلفون جوال لابتوب كمبيوتر كيبورد ماوس شاشة شاحن بطارية كاميرا
             روبوت وايفاي إنترنت باسوورد إيميل تطبيق لعبة سماعة سبيكر طابعة آيباد ريموت سلك ستلايت صاروخ درون
             فيديو سيلفي موقع تحميل إشعار مايك تلفزيون"""))),
    dict(id='red',
         en=dict(name='Things that are red', words=_w("""apple strawberry cherry tomato rose heart blood fire lipstick
             ladybug watermelon chilli lobster ketchup brick ruby blush cranberry
             raspberry pomegranate flag carpet crab cardinal lava valentine balloon poppy candy""")),
         ar=dict(name='أشياء لونها أحمر', words=_w("""تفاحة فراولة كرز طماطم وردة قلب دم نار روج دعسوقة بطيخ فلفل
             كاتشب إطفائية إشارة طابوق ياقوت رمان علم سجادة جمبري لافا بالون حلاو خدود شفايف"""))),
    dict(id='kitchen',
         en=dict(name='The kitchen', words=_w("""fridge oven stove spoon fork knife plate bowl cup pan pot kettle
             toaster blender microwave sink apron recipe salt pepper sugar flour butter egg bread rice onion
             garlic chef spatula napkin""")),
         ar=dict(name='المطبخ', words=_w("""ثلاجة فرن طباخ ملعقة شوكة سكين صحن زبدية كوب طاوة قدر غلاية خلاط
             مايكرويف مغسلة مريلة وصفة ملح فلفل سكر طحين زبدة بيض خبز عيش بصل ثوم شيف دلة فنجان"""))),
    dict(id='wedding',
         en=dict(name='Weddings', words=_w("""bride groom ring dress cake flowers veil music dance photographer
             guests invitation gold perfume makeup henna hall chandelier gift lights stage singer tears
             speech honeymoon bouquet suit tiara candles""")),
         ar=dict(name='الأعراس', words=_w("""عروس معرس خاتم فستان كيكة ورد طرحة أغاني رقص مصورة معازيم دعوة ذهب
             عطر مكياج حنة قاعة ثريا هدية ليتات كوشة مطربة دموع شبكة بوكيه بشت تاج زفة دزة"""))),
    dict(id='space',
         en=dict(name='Space', words=_w("""moon star planet sun rocket astronaut alien galaxy comet meteor orbit
             telescope satellite gravity mars earth saturn jupiter eclipse spaceship helmet crater universe
             nebula launch countdown shuttle""")),
         ar=dict(name='الفضاء', words=_w("""قمر نجمة كوكب شمس صاروخ فضائي مجرة مذنب نيزك مدار تلسكوب
             ستلايت جاذبية مريخ أرض زحل مشتري كسوف مركبة خوذة فوهة كون إطلاق مكوك مرصد هلال فلك"""))),
    dict(id='school',
         en=dict(name='School', words=_w("""teacher student pencil pen eraser ruler notebook book backpack desk
             classroom homework exam bell principal library uniform lunch chalk board grade math science
             history break bus friend calculator report""")),
         ar=dict(name='المدرسة', words=_w("""مدرسة معلمة طالبة قلم ممحاة مسطرة دفتر كتاب شنطة طاولة صف واجب
             امتحان جرس مديرة مكتبة يونيفورم فسحة طباشير سبورة درجات رياضيات علوم تاريخ باص صديقة شهادة"""))),
    dict(id='animals',
         en=dict(name='Animals', words=_w("""cat dog lion tiger elephant giraffe monkey horse camel cow sheep goat
             chicken duck owl falcon rabbit mouse snake frog turtle penguin bear zebra kangaroo panda fox wolf
             parrot squirrel""")),
         ar=dict(name='الحيوانات', words=_w("""قطوة كلب أسد نمر فيل زرافة قرد حصان جمل بقرة خروف عنز دجاجة بطة
             بومة صقر أرنب فار ثعبان ضفدع سلحفاة بطريق دب حمار كنغر باندا ثعلب ذيب ببغاء سنجاب"""))),
    dict(id='weather',
         en=dict(name='Weather', words=_w("""sun rain cloud wind storm thunder lightning snow fog dust heat cold
             rainbow umbrella jacket forecast hail breeze humidity sunset temperature flood ice summer winter
             spring autumn sandstorm drizzle tornado""")),
         ar=dict(name='الجو', words=_w("""شمس مطر غيمة هوا عاصفة رعد برق ثلج ضباب غبار طوز حر برد شمسية
             جاكيت نشرة نسمة رطوبة غروب حرارة سيل صيف شتا ربيع خريف"""))),
    dict(id='travel',
         en=dict(name='Travel', words=_w("""airport passport ticket suitcase plane hotel map taxi train beach
             camera souvenir pilot gate luggage visa tour guide museum postcard sunglasses backpack holiday
             booking room breakfast queue delay jetlag airline""")),
         ar=dict(name='السفر', words=_w("""مطار جواز تذكرة شنطة طيارة فندق خريطة تكسي قطار شاطئ كاميرا تذكار
             طيار بوابة عفش فيزا جولة مرشد متحف كارت نظارة إجازة حجز غرفة ريوق طابور تأخير مضيفة"""))),
    dict(id='sports',
         en=dict(name='Sports', words=_w("""ball goal football basketball tennis swimming running race medal
             trophy coach team referee whistle stadium player score match helmet gym boxing golf cycling
             skateboard bowling padel net jersey sneakers champion""")),
         ar=dict(name='الرياضة', words=_w("""كورة قول سباحة ركض سباق ميدالية كأس مدرب فريق حكم صفارة ملعب لاعب
             نتيجة مباراة خوذة نادي ملاكمة جولف دراجة سكيت بولينج بادل شبكة فانيلة جوتي بطل تنس سلة"""))),
    dict(id='fashion',
         en=dict(name='Fashion', words=_w("""dress skirt shirt jacket coat heels sneakers bag handbag scarf hat
             sunglasses necklace earring bracelet ring watch belt jeans makeup lipstick mascara perfume nails
             mirror runway designer model silk velvet""")),
         ar=dict(name='الموضة', words=_w("""فستان تنورة قميص جاكيت كوت كعب جوتي شنطة شيلة قبعة نظارة قلادة حلق
             سوار خاتم ساعة حزام جينز مكياج روج مسكرة عطر أظافر مراية عرض مصممة موديل حرير مخمل عباية"""))),
    dict(id='food',
         en=dict(name='Food', words=_w("""pizza burger fries pasta rice chicken sushi salad soup sandwich cake
             cookie chocolate donut popcorn cheese bread egg pancake waffle noodles shawarma falafel
             taco steak honey yogurt cereal croissant""")),
         ar=dict(name='الأكل', words=_w("""بيتزا برقر بطاط باستا عيش دجاج سوشي سلطة شوربة ساندويش كيكة كوكيز
             شوكولاتة آيسكريم دونات فشار جبن خبز بيض بانكيك وافل نودلز شاورما فلافل ستيك عسل لبن مجبوس هريس
             لقيمات"""))),
    dict(id='night',
         en=dict(name='Night time', words=_w("""moon stars dark dream sleep pillow blanket bed pajamas lamp candle
             owl midnight snack ghost shadow alarm yawn bedtime story nightlight fireworks party streetlight
             silence crickets dinner bath teeth""")),
         ar=dict(name='الليل', words=_w("""قمر نجوم ظلام حلم نوم مخدة بطانية سرير بجامة أباجورة شمعة بومة
             سناك شبح ظل منبه تثاوب قصة ألعاب سهرة عشا سكوت صراصير أسنان كابوس"""))),
    dict(id='home',
         en=dict(name='At home', words=_w("""door window sofa table chair bed lamp carpet curtain mirror clock
             pillow blanket fridge stairs roof garden key doorbell shelf vase plant towel remote television
             wardrobe drawer balcony garage""")),
         ar=dict(name='البيت', words=_w("""باب دريشة كنبة طاولة كرسي سرير أباجورة زولية ستارة مراية ساعة مخدة
             بطانية ثلاجة درج سطح حوش مفتاح جرس رف مزهرية زرع منشفة ريموت تلفزيون كبت جرار بلكونة كراج"""))),
    dict(id='gulf',
         en=dict(name='The Gulf', words=_w("""desert camel falcon palm dates coffee incense pearl dhow souq mosque
             chalet tent oud perfume abaya gold sand dune beach majlis sunset tea mall heat bakhoor bisht
             kandura ghutra""")),
         ar=dict(name='الخليج', words=_w("""صحراء جمل صقر نخلة تمر قهوة بخور لؤلؤ بوم سوق شاليه خيمة عود عطر
             عباية ذهب رمل كثبان شاطئ ديوانية غروب شاي مول حر بشت دشداشة غترة عقال مجبوس كشتة"""))),
    dict(id='music',
         en=dict(name='Music', words=_w("""song singer guitar piano drum violin microphone concert stage band
             album speaker headphones dance beat rhythm melody lyrics radio playlist chorus note trumpet
             flute harp karaoke fan ticket encore record""")),
         ar=dict(name='الموسيقى', words=_w("""أغنية مطرب جيتار بيانو طبل كمان مايك حفلة مسرح فرقة ألبوم سماعة رقص
             إيقاع لحن كلمات راديو قائمة كورس نوتة ترومبيت ناي عود كاريوكي جمهور تذكرة"""))),
]

BY_ID = {c['id']: c for c in CATEGORIES}


def category(cid, lang):
    c = BY_ID.get(cid)
    return c and c['ar' if lang == 'ar' else 'en']
