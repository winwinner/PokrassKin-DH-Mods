/*
	Lobby Duel - PokrassKin DH Mods (https://github.com/winwinner/PokrassKin-DH-Mods)
	EN: PvP duels without death in the pre-match lobby (knockdown, then auto-revive
	and a kill message), plus healer skeletons (interact or punch to heal to full).
	Install ONLY on the PC of the player who creates the lobby (the lobby is a
	listen server on the host's client); other players stay vanilla. Active only
	in the MenuLobby world. Drop into Binaries/Win64/Patches (Frida Gadget loader).
	Comments below are in Russian; settings are commented in both languages.
*/
/*
	Лобби: дуэли без смерти и скелеты-лекари.

	Ставится ТОЛЬКО хосту лобби. Хост это листен-сервер, то есть авторитет: урон,
	здоровье и заспавненные актёры считаются у него и реплицируются остальным
	штатным сетевым кодом. Чужие клиенты остаются полностью ванильными, ставить им
	нечего. Если лобби создал не ты, мод не сделает ничего - это не его данные.

	Работает только в мире MenuLobby. В любом другом мире не трогает ничего.

	==================== Что делает ====================

	Дуэли. Урон между игроками включается, считает его сама игра. Когда у персонажа
	кончается первая линейка здоровья, игра штатно роняет его в нокдаун - это и есть
	'потерял все ХП'. Через ReviveDelayMs мод поднимает его обратно и рассылает всем
	сообщение вида 'Вася (74) kill Петя'. Смерти не происходит.

	Лечение. В лобби спавнятся вертикальные скелеты. Нажатие на скелет или удар по
	нему кулаком лечит нажавшего до полного здоровья.

	==================== Как это устроено ====================

	1. Гейт урона. ADH_HumanCharacter::TakeDamage в лобби вызывается с верным уроном,
	   но в начале функции стоит проверка:
			00DEDD76  cmp byte [rcx+0x11D1], 0   ; ответ уже закэширован?
			00DEDD9D  call 0xF0AF50              ; GetWorld()->GameState->byte[0x3B1]
			00DEDDA2  mov byte [rsi+0x11D0], al  ; кэш на самом персонаже
			00DEDDA8  cmp byte [rsi+0x11D0], 0
			00DEDDB4  xorps xmm6, xmm6           <- иначе урон обнуляется
	   Мод на время одного вызова ставит 0x11D1=1 и 0x11D0=0 и сразу возвращает как
	   было. Гейм-стейт не трогается. Дальше по функции гейтов нет: на 0xDEDFBB идёт
	   Super::TakeDamage, который и снимает здоровье.

	2. Урон мод не считает. Считает игра, со всеми множителями, дистанцией броска и
	   зоной попадания. Замерено вживую: топор 16, стрела 19, лопата 14, палка 6,
	   кулак 7.

	3. Двойное срабатывание. По локально управляемому персонажу один замах приходит в
	   TakeDamage дважды - полным числом и следом с коэффициентом 0.75, с разрывом
	   1-14 мс. По удалённым персонажам второго вызова нет. Похоже на попадание,
	   засчитанное и по капсуле, и по зоне тела. В штатной игре это ни на что не
	   влияет: в лобби урон выключен целиком, а в матче выделенный сервер вообще не
	   владеет персонажами локально. Мод считает повторный вызов с той же тройкой
	   жертва/бьющий/тип урона внутри SameHitWindowMs тем же замахом и не пропускает
	   его. Замах топора длится 1.1 с, так что настоящую серию ударов окно не заденет.

	4. Нокдаун. У персонажа две линейки в одном поле +0x94c, переключает их байт
	   +0xE10. Когда первая уходит в ноль, игра сама ставит +0xE10=1 и роняет
	   персонажа. Состояние реплицируется, поэтому падение видят все на ванильных
	   клиентах, без единого элемента интерфейса от нас.

	5. Подъём. Через ReviveDelayMs мод зовёт полный штатный Revive (0xDE6730) - тот
	   же, которым поднимает кровать. Он восстанавливает здоровье, чинит рассудок,
	   останавливает монтаж, снимает состояние и в конце вызывает 0xDE9E60(this, 0,
	   -1), то есть освобождает персонажа из рук носильщика - без этого подъём того,
	   кого несут, выкидывал его за текстуры. Поднимает Revive с половиной здоровья,
	   поэтому мод доливает до MaxHealth. Пока персонаж лежит, гейт не снимается -
	   добить его нельзя.

	6. Сообщение. ADH_PlayerController::ReceiveThrallMessage - клиентский RPC, тот же
	   канал, которым пользуются серверные скрипты объявлений. Вызванный
	   у хоста на контроллере игрока, он приезжает этому игроку и рисуется его
	   штатным виджетом. Длительность показа задать нельзя: функция принимает только
	   текст и звук, а сколько держать сообщение решает виджет получателя.

	7. Скелеты. Модель из Environment/FoodStorage - это те скелеты, что висят на
	   крюках в провизионке, то есть вертикальные. Точки заданы телом: игрок вставал
	   на место и стоял неподвижно, а отдельная проба записывала координаты.

	   Точки перехвата найдены прогоном с включённым логом имён функций, вызванных на
	   скелете:
			OnInteract        - нажатие;
			ReceiveAnyDamage  - удар:
			                    void ReceiveAnyDamage(float Damage,
			                                          const UDamageType* DamageType,
			                                          AController* InstigatedBy,
			                                          AActor* DamageCauser)
			                    Damage на 0, DamageType на 8, InstigatedBy на 16,
			                    DamageCauser на 24. Тип урона - объект по умолчанию
			                    своего класса, поэтому сравнивается имя класса.

	==================== Потоки и адреса ====================

	Всё, что меняет состояние, делается с игрового потока, из хука на
	UObject::ProcessEvent. Его адрес не подбирается сигнатурой, а берётся из таблицы
	виртуальных функций по смещению +0x218 - это видно в ReceiveThrallMessage,
	которая отправляет RPC вызовом call qword ptr [rbx+0x218]. Замерено: 35-90 тысяч
	вызовов за пять секунд, то есть надёжный кадровый тик. Свой вызов из хука тоже
	проходит через ProcessEvent, поэтому есть флаг от рекурсии. Никаких действий из
	потока Frida: это ломает синхронизацию игры.

	Осторожность с чужими адресами. ADH_ArmoryDoor::Tick (0xEEB100) из стороннего
	[Dock Patch] Armory Password-Free.js в лобби не вызывается - двери оружейки там нет,
	счётчик оставался нулевым. В матче адрес рабочий, это проверено. Непроверенные
	адреса не используются там, где без них можно обойтись: FActorSpawnParameters не
	конструируется вызовом, а просто обнуляется, а класс скелета сначала пытаемся
	перехватить у уже существующего в мире актёра.

	Позиция актёра берётся штатной K2_GetActorLocation: смещение +0xDE0 годится
	только для персонажа, у обычного актёра там пусто.

	Функции ищутся обходом списка класса: UObject+0x10 класс, UStruct+0x40
	SuperStruct, UStruct+0x48 Children, UField+0x28 Next. Смещения не угаданы - они
	видны в TakeDamage, где приведение типа читает FStructBaseChain по +0x30 и +0x38.

*/

var Switch = 1;//master switch, 0 - off / общий выключатель

//------- duels / дуэли -------
var ReviveDelayMs = 1500;//how long a knocked-down player stays down, ms / сколько лежать до подъёма
var SameHitWindowMs = 250;//a repeat hit within this window counts as the same swing / окно, внутри которого повтор считается тем же замахом
var Announce = 1;//tell everyone who knocked down whom / сообщать всем, кто кого вырубил

//------- healing / лечение -------
var SpawnSkeletons = 1;//spawn healer skeletons / спавнить скелетов-лекарей
var HealOnInteract = 1;//heal whoever interacts with a skeleton / лечить того, кто нажал на скелет
var HealOnHit = 1;//heal whoever hits a skeleton with a matching damage type / лечить того, кто ударил скелет подходящим уроном
//damage types that heal when hitting a skeleton (fists only now)
//какие типы урона по скелету считать лечащими. Сейчас только кулак
var HealDamageTypes = ['DT_FistBlunt_C'];
//search radius for the player if the call does not identify them (horizontal)
//на каком расстоянии искать игрока, если он не опознан по параметрам вызова.
//Считается по горизонтали: скелет висит высоко, разница по высоте мешала бы
var HealRadius = 350.0;
//per-player heal cooldown, ms
//не лечить одного и того же чаще, чем раз в столько
var HealCooldownMs = 3000;

/*
	Skeletons: hand-placed points for the current MenuLobby map (At = player
	position, ZAdjust = height fix, Rotation = Pitch/Yaw/Roll in degrees,
	Backward/Right = shifts relative to the model's facing).

	Скелеты. На каждый:
		At        - точка из пробы, координата персонажа на стоянке;
		ZAdjust   - поправка по высоте. Координата персонажа это центр капсулы, пол
		            примерно на 88 ниже;
		Rotation  - поворот в градусах: Pitch, Yaw, Roll. Направо - плюс к Yaw;
		Backward  - отодвинуть назад вдоль направления модели, минус - вперёд;
		Right     - сдвинуть вправо относительно модели, минус - влево.

	Сдвиги считаются от направления модели, а не по осям мира. Следствие: при смене
	угла поворачивается и направление сдвига.

	В комментариях сохранена история подгонки - так очередную правку можно просто
	прибавить, не пересчитывая заново.
*/
var Skeletons = [
	{
		//первый. По высоте: 142 - 50 = 92
		At : [-8289.0, 5136.0, 366.0],
		ZAdjust : 92.0,
		Rotation : [0.0, -90.0, 0.0],
		Backward : 50.0,
		Right : 100.0
	},
	{
		//второй. По высоте: 142 - 100 - 150 + 75 = -33. Угол задан прямо: 55.
		//Вбок: -40, потом -50, потом вправо на метр, итого +10
		At : [-8721.0, 5184.0, 326.0],
		ZAdjust : -33.0,
		Rotation : [0.0, 55.0, 0.0],
		Backward : 0.0,
		Right : 10.0
	},
	{
		//третий. По повороту: -90, направо на 75, отсюда -15.
		//По высоте: 142 + 30 - 100 = 72
		At : [-5082.0, 4613.0, 342.0],
		ZAdjust : 72.0,
		Rotation : [0.0, -15.0, 0.0],
		Backward : 0.0,
		Right : 0.0
	}
];

if(Switch){
	var base = Module.findBaseAddress("DreadHunger-Win64-Shipping.exe");

	var ADH_HumanCharacter_TakeDamage_addr = base.add(0xDEDD40);
	var UWorld_SpawnActor_addr = base.add(0x29D7340);
	var ADH_HumanCharacter_AddStartingInventory_addr = base.add(0xDC1630);

	var ADH_HumanCharacter_Revive = new NativeFunction(base.add(0xDE6730), 'void', ['pointer'], 'win64');
	var ADH_HumanCharacter_SetCurrentHealth = new NativeFunction(base.add(0xDE83C0), 'void', ['pointer', 'float'], 'win64');
	var ADH_HumanCharacter_SetIncapacitated = new NativeFunction(base.add(0xDE9650), 'void', ['pointer', 'uint8'], 'win64');
	var FName_GetPlainNameString = new NativeFunction(base.add(0x11D7830), 'void', ['pointer', 'pointer'], 'win64');
	var UObject_GetWorld = new NativeFunction(base.add(0x1380FD0), 'pointer', ['pointer'], 'win64');
	var UWorld_SpawnActor = new NativeFunction(base.add(0x29D7340), 'pointer', ['pointer', 'pointer', 'pointer', 'pointer'], 'win64');
	var StaticFindObject = new NativeFunction(base.add(0x13F44D0), 'pointer', ['pointer', 'pointer', 'pointer', 'int8'], 'win64');
	var StaticLoadObject = new NativeFunction(base.add(0x13F4CC0), 'pointer', ['pointer', 'pointer', 'pointer', 'pointer', 'int32', 'pointer', 'int8', 'pointer'], 'win64');
	var UClass_GetPrivateStaticClass = new NativeFunction(base.add(0x1269CE0), 'pointer', [], 'win64');
	var UGameplayStatics_GetPlayerController = new NativeFunction(base.add(0x2906300), 'pointer', ['pointer', 'int32'], 'win64');
	var FName_FName = new NativeFunction(base.add(0x11D04D0), 'void', ['pointer', 'pointer', 'int8'], 'win64');
	var FText_FromName = new NativeFunction(base.add(0x110DC20), 'pointer', ['pointer', 'pointer'], 'win64');
	var ADH_PlayerController_ReceiveThrallMessage = new NativeFunction(base.add(0xF5F580), 'void', ['pointer', 'pointer', 'pointer'], 'win64');

	var VtblProcessEvent = 0x218;
	var OffObjectClass = 0x10;
	var OffSuperStruct = 0x40;
	var OffChildren = 0x48;
	var OffFieldNext = 0x28;

	var OffMaxHealth = 0x7e0;
	var OffHealth = 0x94c;
	var OffPlayerState = 0xc40;
	var OffIncapacitated = 0xe10;
	var OffDeathState = 0x818;//DH_Character::DeathState, 0 - жив
	var OffNoDamageCached = 0x11d0;
	var OffNoDamageKnown = 0x11d1;
	//FString с именем игрока на PlayerState. Раскладка классов у серверной и
	//клиентской сборок совпадает, это подтвердилось на 0xC40, 0xE10 и 0x572
	var OffPlayerName = 0x300;
	var OffControllerPlayerState = 0x228;
	var OffControllerPawn = 0x250;

	//вертикальные скелеты из провизионки, по убыванию предпочтения
	var SkeletonPaths = [
		'/Game/Blueprints/Environment/FoodStorage/NakedSkeletons/BP_Skeleton_Naked_01.BP_Skeleton_Naked_01_C',
		'/Game/Blueprints/Environment/FoodStorage/NakedSkeletons/BP_Skeleton_Naked_03.BP_Skeleton_Naked_03_C',
		'/Game/Blueprints/Environment/FoodStorage/ClothedSkeletons/BP_Skeleton_Clothed_01.BP_Skeleton_Clothed_01_C'
	];

	var ProcessEvent = null;
	var ProcessEventHooked = 0;
	var InsideHook = 0;
	var LocationFunc = ptr(0);
	var LocationParms = Memory.alloc(64);

	var World = ptr(0);
	var SpawnTried = 0;
	var SkeletonClass = ptr(0);
	var Spawned = {};//указатель скелета строкой -> сам указатель

	var Characters = [];//{ Pawn, LastHeal }
	//Класс персонажа, для поиска в ProcessEvent. Frida не перехватывает вызовы из
	//другого своего обработчика, поэтому пешку, заспавненную Lobby Respawn из хука,
	//SpawnActor не видит, и без этого скелеты не лечили бы возрождённых.
	var CharacterClass = ptr(0);
	var Downed = {};//указатель персонажа строкой -> { Character, At }
	var LastHit = {};//жертва+бьющий+тип -> время последнего пропущенного удара

	function logError(Info) {
		try {
			var f = new File('output.log', 'a');
			f.write('[LobbyMod] ' + Info + '\n');
			f.close();
		}
		catch(e) {
		}
	}

	function newFString(Length) {
		var FString = Memory.alloc(16 + Length * 2);
		FString.writePointer(FString.add(16));
		FString.add(8).writeU32(0);
		FString.add(12).writeU32(Length);
		return FString;
	}

	function getObjectName(UObject) {
		if(UObject === null || UObject.isNull()) {
			return '';
		}
		try {
			var NameBuffer = newFString(256);
			FName_GetPlainNameString(UObject.add(0x18), NameBuffer);
			return NameBuffer.readPointer().readUtf16String();
		}
		catch(e) {
			return '';
		}
	}

	function getObjectClassName(UObject) {
		if(UObject === null || UObject.isNull()) {
			return '';
		}
		try {
			return getObjectName(UObject.add(OffObjectClass).readPointer());
		}
		catch(e) {
			return '';
		}
	}

	//единственный предохранитель: вне лобби мод не делает ничего
	function isLobby(Object) {
		try {
			var Their = UObject_GetWorld(Object);
			return !Their.isNull() && getObjectName(Their).indexOf('MenuLobby') >= 0;
		}
		catch(e) {
			return false;
		}
	}

	function safeFloat(Object, Offset) {
		try {
			return Object.add(Offset).readFloat();
		}
		catch(e) {
			return NaN;
		}
	}

	function safeByte(Object, Offset) {
		try {
			return Object.add(Offset).readU8();
		}
		catch(e) {
			return -1;
		}
	}

	function wide(Value) {
		var Buffer = Memory.alloc((Value.length + 1) * 2);
		Buffer.writeUtf16String(Value);
		return Buffer;
	}

	//UFunction по имени: обход списка функций класса с подъёмом по предкам
	function findFunction(Object, WantName) {
		try {
			var Clazz = Object.add(OffObjectClass).readPointer();
			var ClassGuard = 0;
			while(!Clazz.isNull() && ClassGuard++ < 32) {
				var Field = Clazz.add(OffChildren).readPointer();
				var FieldGuard = 0;
				while(!Field.isNull() && FieldGuard++ < 4000) {
					if(getObjectName(Field) === WantName) {
						return Field;
					}
					Field = Field.add(OffFieldNext).readPointer();
				}
				Clazz = Clazz.add(OffSuperStruct).readPointer();
			}
		}
		catch(e) {
		}
		return ptr(0);
	}

	//позиция у самой игры: читать из памяти можно только у персонажа
	function actorLocation(Actor) {
		if(Actor === null || Actor.isNull() || ProcessEvent === null || LocationFunc.isNull()) {
			return null;
		}
		try {
			LocationParms.writeByteArray([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
			ProcessEvent(Actor, LocationFunc, LocationParms);
			return {
				X : LocationParms.readFloat(),
				Y : LocationParms.add(4).readFloat(),
				Z : LocationParms.add(8).readFloat()
			};
		}
		catch(e) {
			return null;
		}
	}

	//по горизонтали: скелет висит на высоте, разница по Z только мешала бы
	function distance(A, B) {
		if(A === null || B === null) {
			return 1e9;
		}
		var dx = A.X - B.X, dy = A.Y - B.Y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	//=============== имена и сообщения ===============

	//FString: указатель на буфер, дальше длина. Длину проверяем, чтобы не уехать в
	//мусор, если смещение окажется не тем
	function readFString(Address) {
		try {
			var Data = Address.readPointer();
			var Length = Address.add(8).readU32();
			if(Data.isNull() || Length < 1 || Length > 64) {
				return null;
			}
			return Data.readUtf16String(Length);
		}
		catch(e) {
			return null;
		}
	}

	function nameFromPlayerState(PlayerState) {
		if(PlayerState === null || PlayerState.isNull()) {
			return null;
		}
		var Name = readFString(PlayerState.add(OffPlayerName));
		if(Name === null) {
			return null;
		}
		return Name.replace(/\0+$/, '').trim() || null;
	}

	function playerName(Character, Controller) {
		try {
			if(Character !== null && !Character.isNull()) {
				var Name = nameFromPlayerState(Character.add(OffPlayerState).readPointer());
				if(Name) {
					return Name;
				}
			}
		}
		catch(e) {
		}
		try {
			if(Controller !== undefined && Controller !== null && !Controller.isNull()) {
				var ByController = nameFromPlayerState(Controller.add(OffControllerPlayerState).readPointer());
				if(ByController) {
					return ByController;
				}
			}
		}
		catch(e) {
		}
		return 'кто-то';
	}

	//обычно причинивший урон актёр и есть персонаж, но для снаряда это может быть
	//не так, поэтому запасной путь - пешка инстигатора
	function attackerCharacter(Causer, Instigator) {
		try {
			if(Causer !== null && !Causer.isNull()) {
				var Health = safeFloat(Causer, OffHealth);
				if(isFinite(Health) && Health >= 0 && Health <= 1000) {
					return Causer;
				}
			}
		}
		catch(e) {
		}
		try {
			if(Instigator !== null && !Instigator.isNull()) {
				var Pawn = Instigator.add(OffControllerPawn).readPointer();
				if(!Pawn.isNull()) {
					return Pawn;
				}
			}
		}
		catch(e) {
		}
		return Causer;
	}

	function healthText(Character) {
		var Health = safeFloat(Character, OffHealth);
		if(!isFinite(Health) || Health < 0 || Health > 1000) {
			return '';
		}
		return ' (' + Math.round(Health) + ')';
	}

	function makeFText(Text) {
		var NameBuffer = Memory.alloc(8);
		var Source = Memory.alloc((Text.length + 4) * 2);
		Source.writeUtf16String(Text);
		FName_FName(NameBuffer, Source, 1);
		var TextBuffer = Memory.alloc(24);
		FText_FromName(TextBuffer, NameBuffer);
		return TextBuffer;
	}

	//У хоста итератор контроллеров содержит и свой, и удалённые, поэтому одного
	//прохода хватает. FText строим один раз на сообщение.
	function announceToAll(WorldContext, Text) {
		try {
			var Message = makeFText(Text);
			var Misses = 0;
			for(var i = 0; i < 16 && Misses < 4; i++) {
				var Controller = UGameplayStatics_GetPlayerController(WorldContext, i);
				if(Controller.isNull()) {
					Misses++;
					continue;
				}
				Misses = 0;
				ADH_PlayerController_ReceiveThrallMessage(Controller, Message, ptr(0));
			}
		}
		catch(e) {
			logError('ошибка рассылки: ' + e);
		}
	}

	//=============== дуэли ===============

	function revive(Character, Key) {
		try {
			ADH_HumanCharacter_Revive(Character);

			//если полный подъём упёрся в собственную предусловную проверку,
			//доделываем, чтобы персонаж не остался лежать
			if(safeByte(Character, OffIncapacitated) !== 0) {
				ADH_HumanCharacter_SetIncapacitated(Character, 0);
			}

			//Revive поднимает с половиной здоровья, для дуэли нужно полное
			var Max = safeFloat(Character, OffMaxHealth);
			if(!isFinite(Max) || Max <= 0) {
				Max = 100.0;
			}
			ADH_HumanCharacter_SetCurrentHealth(Character, Max);
		}
		catch(e) {
			logError('ошибка подъёма ' + Character + ': ' + e);
		}
		delete Downed[Key];
	}

	//SkipKey - персонаж, которого уронили прямо в текущем вызове: его трогать
	//нельзя, пока игра внутри TakeDamage
	function servePending(Now, SkipKey) {
		for(var Key in Downed) {
			if(SkipKey !== null && Key === SkipKey) {
				continue;
			}
			var Entry = Downed[Key];
			if(Now - Entry.At < ReviveDelayMs) {
				continue;
			}
			revive(Entry.Character, Key);
		}
	}

	//чтобы таблица дублей не росла бесконечно за долгую сессию
	function pruneHits(Now) {
		var Keys = Object.keys(LastHit);
		if(Keys.length < 64) {
			return;
		}
		for(var i = 0; i < Keys.length; i++) {
			if(Now - LastHit[Keys[i]] > 10000) {
				delete LastHit[Keys[i]];
			}
		}
	}

	//=============== скелеты и лечение ===============

	//FRotator в кватернион, как это делает FRotator::Quaternion в движке
	function rotatorToQuat(Pitch, Yaw, Roll) {
		var K = Math.PI / 360.0;//градусы в радианы, сразу делённые пополам
		var sp = Math.sin(Pitch * K), cp = Math.cos(Pitch * K);
		var sy = Math.sin(Yaw * K), cy = Math.cos(Yaw * K);
		var sr = Math.sin(Roll * K), cr = Math.cos(Roll * K);
		return {
			X : cr * sp * sy - sr * cp * cy,
			Y : -cr * sp * cy - sr * cp * sy,
			Z : cr * cp * sy - sr * sp * cy,
			W : cr * cp * cy + sr * sp * sy
		};
	}

	function findSkeletonClass() {
		if(!SkeletonClass.isNull()) {
			return SkeletonClass;
		}
		//сначала ищем уже загруженный класс, грузить с диска - крайний случай
		for(var i = 0; i < SkeletonPaths.length; i++) {
			try {
				var Found = StaticFindObject(UClass_GetPrivateStaticClass(), ptr(0xFFFFFFFFFFFFFFFF), wide(SkeletonPaths[i]), 0);
				if(!Found.isNull()) {
					return Found;
				}
			}
			catch(e) {
			}
		}
		for(var j = 0; j < SkeletonPaths.length; j++) {
			try {
				var Loaded = StaticLoadObject(UClass_GetPrivateStaticClass(), ptr(0), wide(SkeletonPaths[j]), ptr(0), 0, ptr(0), 1, ptr(0));
				if(!Loaded.isNull()) {
					return Loaded;
				}
			}
			catch(e) {
			}
		}
		return ptr(0);
	}

	function spawnOne(Clazz, Entry, Index) {
		try {
			var Yaw = Entry.Rotation[1];
			//собственные направления модели по рысканью: вперёд и вправо.
			//Знак правого подобран вживую
			var Radians = Yaw * Math.PI / 180.0;
			var ForwardX = Math.cos(Radians), ForwardY = Math.sin(Radians);
			var RightX = ForwardY, RightY = -ForwardX;
			var Back = Entry.Backward || 0.0;
			var Side = Entry.Right || 0.0;
			var X = Entry.At[0] - ForwardX * Back + RightX * Side;
			var Y = Entry.At[1] - ForwardY * Back + RightY * Side;
			var Z = Entry.At[2] + Entry.ZAdjust;

			//FTransform: кватернион, перенос, масштаб. Поворот задаём именно здесь -
			//после спавна статичный пропс уже не развернуть
			var Quat = rotatorToQuat(Entry.Rotation[0], Yaw, Entry.Rotation[2]);
			var Transform = Memory.alloc(64);
			Transform.writeByteArray(new Array(64).fill(0));
			Transform.writeFloat(Quat.X);
			Transform.add(4).writeFloat(Quat.Y);
			Transform.add(8).writeFloat(Quat.Z);
			Transform.add(12).writeFloat(Quat.W);
			Transform.add(16).writeFloat(X);
			Transform.add(20).writeFloat(Y);
			Transform.add(24).writeFloat(Z);
			Transform.add(32).writeFloat(1.0);
			Transform.add(36).writeFloat(1.0);
			Transform.add(40).writeFloat(1.0);

			//FActorSpawnParameters: нули и есть значения по умолчанию
			var Parameters = Memory.alloc(0x40);
			Parameters.writeByteArray(new Array(0x40).fill(0));

			var Actor = UWorld_SpawnActor(World, Clazz, Transform, Parameters);
			if(Actor.isNull()) {
				logError('скелет ' + Index + ': SpawnActor вернул ноль');
				return;
			}
			var Pointer = ptr(Actor.toString());
			Spawned[Pointer.toString()] = Pointer;
		}
		catch(e) {
			logError('скелет ' + Index + ': спавн не удался: ' + e);
		}
	}

	function spawnSkeletons() {
		if(!SpawnSkeletons || SpawnTried || World.isNull()) {
			return;
		}
		SpawnTried = 1;

		var Clazz = findSkeletonClass();
		if(Clazz.isNull()) {
			logError('класс скелета не найден, спавн отменён');
			return;
		}
		for(var i = 0; i < Skeletons.length; i++) {
			spawnOne(Clazz, Skeletons[i], i + 1);
		}
	}

	//Выбросить из учёта мёртвых и уничтоженных. С уборкой трупов и респавном
	//(Lobby Corpse Cleanup, Lobby Respawn) пешек за время лобби становится больше 16,
	//а по указателю уничтоженного тела нельзя звать K2_GetActorLocation.
	function pruneCharacters() {
		for(var i = Characters.length - 1; i >= 0; i--) {
			var Pawn = Characters[i].Pawn;
			if(getObjectClassName(Pawn).indexOf('HumanCharacter') < 0 || safeByte(Pawn, OffDeathState) !== 0) {
				Characters.splice(i, 1);
			}
		}
	}

	function characterByPointer(Candidate) {
		if(Candidate === null || Candidate.isNull()) {
			return null;
		}
		for(var i = 0; i < Characters.length; i++) {
			if(Characters[i].Pawn.equals(Candidate)) {
				return Characters[i];
			}
		}
		return null;
	}

	//кто нажал: пробуем первые указатели в буфере параметров
	function characterFromParms(Parms) {
		if(Parms === null || Parms.isNull()) {
			return null;
		}
		for(var Offset = 0; Offset <= 24; Offset += 8) {
			try {
				var Who = characterByPointer(Parms.add(Offset).readPointer());
				if(Who !== null) {
					return Who;
				}
			}
			catch(e) {
			}
		}
		return null;
	}

	function nearestCharacter(Skeleton) {
		pruneCharacters();
		var Here = actorLocation(Skeleton);
		if(Here === null) {
			return null;
		}
		var Best = null;
		var BestDistance = HealRadius;
		for(var i = 0; i < Characters.length; i++) {
			var D = distance(Here, actorLocation(Characters[i].Pawn));
			if(D < BestDistance) {
				BestDistance = D;
				Best = Characters[i];
			}
		}
		return Best;
	}

	function heal(Entry) {
		var Now = Date.now();
		if(Now - Entry.LastHeal < HealCooldownMs) {
			return;
		}
		try {
			var Max = safeFloat(Entry.Pawn, OffMaxHealth);
			if(!isFinite(Max) || Max <= 0) {
				Max = 100.0;
			}
			ADH_HumanCharacter_SetCurrentHealth(Entry.Pawn, Max);
			Entry.LastHeal = Now;
		}
		catch(e) {
			logError('лечение не удалось: ' + e);
		}
	}

	function onSkeletonDamaged(Skeleton, Parms) {
		if(!HealOnHit || Parms === null || Parms.isNull()) {
			return;
		}
		try {
			if(HealDamageTypes.indexOf(getObjectClassName(Parms.add(8).readPointer())) < 0) {
				return;
			}
			var Who = characterByPointer(Parms.add(24).readPointer());
			if(Who === null) {
				Who = nearestCharacter(Skeleton);
			}
			if(Who !== null) {
				heal(Who);
			}
		}
		catch(e) {
		}
	}

	function onSkeletonInteract(Skeleton, Parms) {
		if(!HealOnInteract) {
			return;
		}
		var Who = characterFromParms(Parms);
		if(Who === null) {
			Who = nearestCharacter(Skeleton);
		}
		if(Who !== null) {
			heal(Who);
		}
	}

	//=============== учёт персонажей и хуки ===============

	function track(Character) {
		if(Character === null || Character.isNull()) {
			return;
		}
		var ClassName = getObjectClassName(Character);

		//класс скелета проще перехватить у живого актёра, чем грузить с диска
		if(SkeletonClass.isNull() && ClassName.indexOf('Skeleton') >= 0 && ClassName.indexOf('Key') < 0) {
			try {
				SkeletonClass = ptr(Character.add(OffObjectClass).readPointer().toString());
			}
			catch(e) {
			}
		}

		if(ClassName.indexOf('HumanCharacter') < 0) {
			return;
		}
		if(World.isNull() && isLobby(Character)) {
			try {
				World = ptr(UObject_GetWorld(Character).toString());
			}
			catch(e) {
			}
		}
		if(characterByPointer(Character) !== null) {
			return;
		}
		pruneCharacters();
		if(Characters.length >= 16) {
			return;
		}
		if(CharacterClass.isNull() && ClassName === 'BP_HumanCharacter_C') {
			CharacterClass = ptr(Character.add(OffObjectClass).readPointer().toString());
		}
		Characters.push({ Pawn : Character, LastHeal : 0 });
		hookProcessEvent(Character);
	}

	function hookProcessEvent(AnyObject) {
		if(ProcessEventHooked) {
			return;
		}
		try {
			var Address = AnyObject.readPointer().add(VtblProcessEvent).readPointer();
			if(Address.isNull()) {
				return;
			}
			ProcessEvent = new NativeFunction(Address, 'void', ['pointer', 'pointer', 'pointer'], 'win64');
			LocationFunc = findFunction(AnyObject, 'K2_GetActorLocation');

			Interceptor.attach(Address, {
				onEnter : function(args) {
					if(InsideHook) {
						return;
					}
					InsideHook = 1;
					try {
						if(!CharacterClass.isNull() && args[0].add(OffObjectClass).readPointer().equals(CharacterClass) &&
							args[0].add(OffDeathState).readU8() === 0 && characterByPointer(args[0]) === null) {
							track(ptr(args[0].toString()));
						}
					}
					catch(e) {
					}
					try {
						var Skeleton = Spawned[args[0].toString()];
						if(Skeleton !== undefined) {
							var FuncName = getObjectName(ptr(args[1].toString()));
							if(FuncName === 'ReceiveAnyDamage') {
								onSkeletonDamaged(Skeleton, ptr(args[2].toString()));
							}
							else if(FuncName === 'OnInteract') {
								onSkeletonInteract(Skeleton, ptr(args[2].toString()));
							}
						}
						spawnSkeletons();
						servePending(Date.now(), null);
					}
					catch(e) {
					}
					InsideHook = 0;
				}
			});
			ProcessEventHooked = 1;
		}
		catch(e) {
			logError('не удалось подключить ProcessEvent: ' + e);
		}
	}

	Interceptor.attach(ADH_HumanCharacter_TakeDamage_addr, {
		onEnter : function(args) {
			try {
				this.Character = ptr(args[0].toString());
				this.Ok = isLobby(this.Character);
				if(!this.Ok) {
					return;
				}

				this.Key = this.Character.toString();
				this.Instigator = ptr(args[3].toString());
				this.Causer = ptr(args[4].toString());
				this.IncapBefore = safeByte(this.Character, OffIncapacitated);

				//лежачего не бьём: пока ждёт подъёма, гейт не снимаем, и игра сама
				//обнулит урон, как делала до мода
				if(Downed[this.Key]) {
					return;
				}

				//тот же замах, пришедший вторым путём: гейт не снимаем
				var TypeKey = '';
				try {
					if(!args[2].isNull()) {
						TypeKey = args[2].add(8).readPointer().toString();
					}
				}
				catch(e) {
				}
				var HitKey = this.Key + '|' + this.Causer.toString() + '|' + TypeKey;
				var Stamp = Date.now();
				var Last = LastHit[HitKey];
				if(SameHitWindowMs > 0 && Last !== undefined && Stamp - Last < SameHitWindowMs) {
					return;
				}
				LastHit[HitKey] = Stamp;
				pruneHits(Stamp);

				this.SavedCached = safeByte(this.Character, OffNoDamageCached);
				this.SavedKnown = safeByte(this.Character, OffNoDamageKnown);
				this.Character.add(OffNoDamageKnown).writeU8(1);
				this.Character.add(OffNoDamageCached).writeU8(0);
				this.Wrote = 1;
			}
			catch(e) {
				logError('ошибка onEnter: ' + e);
			}
		},
		onLeave : function(retval) {
			try {
				if(this.Character === undefined || !this.Ok) {
					return;
				}

				if(this.Wrote) {
					this.Character.add(OffNoDamageCached).writeU8(this.SavedCached);
					this.Character.add(OffNoDamageKnown).writeU8(this.SavedKnown);
				}

				var Now = Date.now();
				var JustDowned = 0;

				if(this.IncapBefore === 0 &&
					safeByte(this.Character, OffIncapacitated) === 1 &&
					!Downed[this.Key]) {
					JustDowned = 1;
					Downed[this.Key] = { Character : this.Character, At : Now };
					if(Announce) {
						announceToAll(this.Character,
							'   ' + playerName(this.Causer, this.Instigator) +
							healthText(attackerCharacter(this.Causer, this.Instigator)) +
							' kill ' + playerName(this.Character, ptr(0)));
					}
				}

				servePending(Now, JustDowned ? this.Key : null);
			}
			catch(e) {
				logError('ошибка onLeave: ' + e);
			}
		}
	});

	Interceptor.attach(UWorld_SpawnActor_addr, {
		onLeave : function(retval) {
			try {
				track(ptr(retval.toString()));
			}
			catch(e) {
			}
		}
	});

	Interceptor.attach(ADH_HumanCharacter_AddStartingInventory_addr, {
		onEnter : function(args) {
			try {
				track(ptr(args[0].toString()));
			}
			catch(e) {
			}
		}
	});
}
