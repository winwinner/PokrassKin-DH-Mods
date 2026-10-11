/*
	Lobby Respawn - PokrassKin DH Mods (https://github.com/winwinner/PokrassKin-DH-Mods)
	EN: respawns dead players in the pre-match lobby after RespawnDelaySec.
	Install ONLY on the PC of the player who creates the lobby (the lobby is a
	listen server on the host's client); other players stay vanilla. Active only
	in the MenuLobby world. Drop into Binaries/Win64/Patches (Frida Gadget loader).
	Comments below are in Russian; settings are commented in both languages.
*/
/*
	Лобби: респавн погибших игроков.

	Ставится ТОЛЬКО хосту лобби: он листен-сервер, пешки спавнит его гейммод, и они
	штатно реплицируются остальным. Чужие клиенты остаются ванильными.

	Работает только в мире MenuLobby. В любом другом мире не трогает ничего.
	Не зависит от [Dock Patch] Lobby Duel.js и [Dock Patch] Lobby Corpse Cleanup.js.

	==================== Как работает ====================

	Пока персонаж жив, мод запоминает его контроллер (+0x258). Когда персонаж умер
	(DH_Character::DeathState +0x818 != 0) и контроллер его отпустил (+0x258 пуст,
	это делает сама игра через DeathUnpossessDelay), мод ждёт RespawnDelaySec и зовёт
	у гейммода штатный AGameModeBase::RestartPlayer(Controller). Он сам выбирает
	PlayerStart, спавнит пешку класса по умолчанию и отдаёт её контроллеру - ровно
	то, что делает игра, когда игрок заходит в лобби.

	Функция ищется по имени в списке функций класса гейммода и вызывается через
	UObject::ProcessEvent (vtable+0x218) с игрового потока.

	Гейммод ловится в UWorld::SpawnActor: движок спавнит его через SpawnActor при
	загрузке мира. Принимается объект, в имени класса которого есть GameMode, и
	только в мире лобби.

	Мёртвое тело мод не трогает: его убирает Lobby Corpse Cleanup.

	Frida не перехватывает вызовы, сделанные изнутри другого её обработчика, поэтому
	пешку, заспавненную нашим же RestartPlayer, хук на SpawnActor не видит. Её мод
	берёт сразу у контроллера (+0x250), а другие пешки, прошедшие мимо хуков,
	ловятся в ProcessEvent по указателю класса.
*/

var Switch = 1;//master switch, 0 - off / общий выключатель
var RespawnDelaySec = 5;//respawn this many seconds after the game releases the body / через сколько секунд после того, как игра отпустила тело, игрок появится снова
var PollMs = 500;//poll interval, ms / период опроса, мс

if(Switch){
	var base = Module.findBaseAddress("DreadHunger-Win64-Shipping.exe");

	var UWorld_SpawnActor_addr = base.add(0x29D7340);
	var ADH_HumanCharacter_AddStartingInventory_addr = base.add(0xDC1630);
	var FName_GetPlainNameString = new NativeFunction(base.add(0x11D7830), 'void', ['pointer', 'pointer'], 'win64');
	var UObject_GetWorld = new NativeFunction(base.add(0x1380FD0), 'pointer', ['pointer'], 'win64');

	var PawnClass = 'BP_HumanCharacter_C';

	var VtblProcessEvent = 0x218;
	var OffObjectClass = 0x10;
	var OffObjectName = 0x18;
	var OffSuperStruct = 0x40;
	var OffChildren = 0x48;
	var OffFieldNext = 0x28;

	var OffDeathState = 0x818;
	var OffCharacterController = 0x258;
	var OffPlayerState = 0xc40;
	var OffPlayerName = 0x300;
	var OffControllerPawn = 0x250;

	var ProcessEvent = null;
	var ProcessEventHooked = 0;
	var InsideHook = 0;
	var NextPoll = 0;

	var GameMode = ptr(0);
	var GameModeClass = '';
	var RestartPlayerFunc = ptr(0);
	var RestartParms = Memory.alloc(64);

	var PawnClassPtr = ptr(0);//класс BP_HumanCharacter_C, для поиска в ProcessEvent

	var Pawns = [];//{ Pawn, Key, Controller, Name, FreedAt }
	var PawnByKey = {};

	function logError(Info) {
		try {
			var f = new File('output.log', 'a');
			f.write('[LobbyRespawn] ' + Info + '\n');
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
			FName_GetPlainNameString(UObject.add(OffObjectName), NameBuffer);
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

	function readPtr(Object, Offset) {
		try {
			return Object.add(Offset).readPointer();
		}
		catch(e) {
			return ptr(0);
		}
	}

	function readByte(Object, Offset) {
		try {
			return Object.add(Offset).readU8();
		}
		catch(e) {
			return -1;
		}
	}

	function isLobby(Object) {
		try {
			var Their = UObject_GetWorld(Object);
			return !Their.isNull() && getObjectName(Their).indexOf('MenuLobby') >= 0;
		}
		catch(e) {
			return false;
		}
	}

	function playerName(Pawn) {
		try {
			var PlayerState = Pawn.add(OffPlayerState).readPointer();
			if(PlayerState.isNull()) {
				return '';
			}
			var Text = PlayerState.add(OffPlayerName);
			var Data = Text.readPointer();
			var Count = Text.add(8).readS32();
			if(Data.isNull() || Count <= 1 || Count > 128) {
				return '';
			}
			return Data.readUtf16String(Count - 1);
		}
		catch(e) {
			return '';
		}
	}

	//UFunction по имени, с подъёмом по цепочке классов объекта
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

	//=============== гейммод ===============

	function gameModeAlive() {
		return !GameMode.isNull() && getObjectClassName(GameMode) === GameModeClass;
	}

	function takeGameMode(Actor, ClassName) {
		if(!isLobby(Actor)) {
			return;
		}
		GameMode = Actor;
		GameModeClass = ClassName;
		RestartPlayerFunc = ptr(0);
		hookProcessEvent(Actor);
	}

	function restartPlayer(Controller) {
		if(RestartPlayerFunc.isNull()) {
			RestartPlayerFunc = findFunction(GameMode, 'RestartPlayer');
			if(RestartPlayerFunc.isNull()) {
				logError('RestartPlayer у ' + GameModeClass + ' не найдена');
				return false;
			}
		}
		RestartParms.writePointer(Controller);
		ProcessEvent(GameMode, RestartPlayerFunc, RestartParms);
		return true;
	}

	//=============== учёт персонажей ===============

	function track(Actor) {
		if(Actor === null || Actor.isNull()) {
			return;
		}
		var ClassName = getObjectClassName(Actor);
		if(ClassName.indexOf('GameMode') >= 0) {
			takeGameMode(Actor, ClassName);
			return;
		}
		if(ClassName !== PawnClass) {
			return;
		}
		var Key = Actor.toString();
		if(PawnByKey[Key] !== undefined) {
			return;
		}
		if(PawnClassPtr.isNull()) {
			PawnClassPtr = ptr(Actor.add(OffObjectClass).readPointer().toString());
		}
		var Entry = { Pawn : Actor, Key : Key, Controller : ptr(0), ControllerClass : '', Name : '', FreedAt : 0 };
		Pawns.push(Entry);
		PawnByKey[Key] = Entry;
		hookProcessEvent(Actor);
	}

	function forget(Entry) {
		delete PawnByKey[Entry.Key];
		for(var i = 0; i < Pawns.length; i++) {
			if(Pawns[i] === Entry) {
				Pawns.splice(i, 1);
				return;
			}
		}
	}

	function poll(Now) {
		for(var i = Pawns.length - 1; i >= 0; i--) {
			var Entry = Pawns[i];
			if(getObjectClassName(Entry.Pawn) !== PawnClass || !isLobby(Entry.Pawn)) {
				forget(Entry);
				continue;
			}

			var Name = playerName(Entry.Pawn);
			if(Name !== '') {
				Entry.Name = Name;
			}

			var Controller = readPtr(Entry.Pawn, OffCharacterController);
			if(readByte(Entry.Pawn, OffDeathState) <= 0) {
				if(!Controller.isNull()) {
					Entry.Controller = Controller;
					Entry.ControllerClass = getObjectClassName(Controller);
				}
				continue;
			}

			//умер: ждём, пока игра сама отпустит тело
			if(!Controller.isNull()) {
				continue;
			}
			//боты и пешки без игрока не возрождаем
			if(Entry.Controller.isNull() || Entry.ControllerClass.indexOf('PlayerController') < 0) {
				forget(Entry);
				continue;
			}
			if(Entry.FreedAt === 0) {
				Entry.FreedAt = Now;
				continue;
			}
			if(Now - Entry.FreedAt < RespawnDelaySec * 1000) {
				continue;
			}

			//игрок вышел - контроллер уничтожен
			if(getObjectClassName(Entry.Controller) !== Entry.ControllerClass) {
				forget(Entry);
				continue;
			}
			//у контроллера уже есть другая пешка
			if(!readPtr(Entry.Controller, OffControllerPawn).isNull()) {
				forget(Entry);
				continue;
			}
			if(!gameModeAlive()) {
				logError('гейммод не пойман, "' + Entry.Name + '" не возрождён');
				forget(Entry);
				continue;
			}

			try {
				if(restartPlayer(Entry.Controller)) {
					//спавн был внутри нашего хука, SpawnActor его не видел
					track(ptr(readPtr(Entry.Controller, OffControllerPawn).toString()));
				}
			}
			catch(e) {
				logError('RestartPlayer для "' + Entry.Name + '" не удался: ' + e);
			}
			forget(Entry);
		}
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
			Interceptor.attach(Address, {
				onEnter : function(args) {
					if(InsideHook) {
						return;
					}
					//Пешка, заспавненная из чужого хука, мимо SpawnActor. Только живая:
					//иначе уже обработанный и забытый труп подхватывался бы снова.
					try {
						if(!PawnClassPtr.isNull() && args[0].add(OffObjectClass).readPointer().equals(PawnClassPtr) &&
							PawnByKey[args[0].toString()] === undefined && args[0].add(OffDeathState).readU8() === 0) {
							track(ptr(args[0].toString()));
						}
					}
					catch(e) {
					}
					if(Pawns.length === 0) {
						return;
					}
					var Now = Date.now();
					if(Now < NextPoll) {
						return;
					}
					NextPoll = Now + PollMs;
					InsideHook = 1;
					try {
						poll(Now);
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
