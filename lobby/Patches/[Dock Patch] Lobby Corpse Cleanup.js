/*
	Lobby Corpse Cleanup - PokrassKin DH Mods (https://github.com/winwinner/PokrassKin-DH-Mods)
	EN: drops a dead player's items and removes the body in the pre-match lobby.
	Install ONLY on the PC of the player who creates the lobby (the lobby is a
	listen server on the host's client); other players stay vanilla. Active only
	in the MenuLobby world. Drop into Binaries/Win64/Patches (Frida Gadget loader).
	Comments below are in Russian; settings are commented in both languages.
*/
/*
	Лобби: уборка тел погибших персонажей.

	Ставится ТОЛЬКО хосту лобби: он листен-сервер, уничтожение актёра на авторитете
	штатно реплицируется остальным. Чужие клиенты остаются ванильными.

	Работает только в мире MenuLobby. В любом другом мире не трогает ничего.
	Не зависит от [Dock Patch] Lobby Duel.js и [Dock Patch] Lobby Respawn.js.

	Убираются только BP_HumanCharacter_C - сравнение по точному имени класса, так что
	крысы (BP_Prey_Rat_C), кролики и гули не попадают, даже если унаследованы от
	того же DH_Character.

	==================== Как работает ====================

	Опрос с игрового потока, из хука на UObject::ProcessEvent (vtable+0x218), раз в
	PollMs. Тело считается трупом, когда DH_Character::DeathState (+0x818) != 0 и
	контроллер (+0x258) уже пуст - его обнуляет сама игра через DeathUnpossessDelay.
	Раньше тело трогать нельзя: камера игрока ещё на нём.

	Через DropItemsAfterSec из трупа выпадают все вещи, ещё через DespawnAfterDropSec
	тело исчезает: AActor::SetLifeSpan, движок сам уничтожит актёра и разошлёт это
	клиентам.

	Выпадение. Для каждого занятого слота зовётся DH_Character::DropInventory_Simulated
	со всем количеством предмета (DH_Inventory::NumberOfItems, +0x8B0). Повтор - только
	пока количество уменьшается, чтобы не наплодить копий на земле. Функции
	вызываются по имени через ProcessEvent, параметры сняты из рефлексии:
		DH_InventoryManager::GetStorageLimit()           return int @0
		DH_InventoryManager::GetStoredInventory(int @0)  return DH_Inventory* @8
		DH_Character::DropInventory_Simulated(int InventoryIndex @0, bool bThrown @4,
			enum DropMethod @5, FVector OffsetVariation @8, FVector RotationVariation @20,
			int DropCount @32) - 36 байт

	Поиск персонажей. Frida не перехватывает вызовы, сделанные изнутри другого её
	обработчика: пешку, которую спавнит Lobby Respawn из хука на ProcessEvent, хук на
	SpawnActor не видит. Поэтому живые персонажи ловятся ещё и в самом ProcessEvent
	по указателю класса.

*/

var Switch = 1;//master switch, 0 - off / общий выключатель
//timers start when the game releases the body (a couple of seconds after death)
//отсчёт идёт с момента, когда игра отпустила тело (это пара секунд после смерти)
var DropItemsAfterSec = 1;//items drop out after this many seconds / через сколько секунд из тела выпадают вещи
var DespawnAfterDropSec = 5;//body disappears this long after the drop / через сколько секунд после выпадения вещей тело исчезает
var DropItems = 1;//1 - drop items, 0 - body vanishes with its inventory / ронять ли вещи; 0 - тело исчезает вместе с инвентарём
var DropSpread = 40.0;//scatter of dropped items, units / разброс выпавших вещей, единиц
var PollMs = 500;//poll interval, ms / период опроса, мс

if(Switch){
	var base = Module.findBaseAddress("DreadHunger-Win64-Shipping.exe");

	var UWorld_SpawnActor_addr = base.add(0x29D7340);
	var ADH_HumanCharacter_AddStartingInventory_addr = base.add(0xDC1630);
	var FName_GetPlainNameString = new NativeFunction(base.add(0x11D7830), 'void', ['pointer', 'pointer'], 'win64');
	var UObject_GetWorld = new NativeFunction(base.add(0x1380FD0), 'pointer', ['pointer'], 'win64');
	var AActor_SetLifeSpan = new NativeFunction(base.add(0x26707C0), 'void', ['pointer', 'float'], 'win64');

	var CorpseClass = 'BP_HumanCharacter_C';

	var VtblProcessEvent = 0x218;
	var OffObjectClass = 0x10;
	var OffObjectName = 0x18;
	var OffSuperStruct = 0x40;
	var OffChildren = 0x48;
	var OffFieldNext = 0x28;

	var OffDeathState = 0x818;
	var OffCharacterController = 0x258;
	var OffInventoryComponent = 0x808;
	var OffNumberOfItems = 0x8b0;//DH_Inventory::NumberOfItems, байт

	var ProcessEvent = null;
	var ProcessEventHooked = 0;
	var InsideHook = 0;
	var NextPoll = 0;

	var PawnClassPtr = ptr(0);//класс BP_HumanCharacter_C, для поиска в ProcessEvent
	var Functions = {};//имя -> UFunction
	var CallParms = Memory.alloc(256);

	var Bodies = [];//{ Pawn, Key, DropAt }
	var BodyByKey = {};

	function logError(Info) {
		try {
			var f = new File('output.log', 'a');
			f.write('[CorpseCleanup] ' + Info + '\n');
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

	//=============== вызовы по имени ===============

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

	//параметры кладёт вызывающий в CallParms; false - функции нет
	function callFunction(Object, Name) {
		var Func = Functions[Name];
		if(Func === undefined) {
			Func = findFunction(Object, Name);
			if(Func.isNull()) {
				logError('функция ' + Name + ' не найдена у ' + getObjectClassName(Object));
			}
			Functions[Name] = Func;
		}
		if(Func.isNull()) {
			return false;
		}
		ProcessEvent(Object, Func, CallParms);
		return true;
	}

	function zeroParms() {
		for(var i = 0; i < 256; i += 8) {
			CallParms.add(i).writeU64(0);
		}
	}

	//=============== выпадение вещей ===============

	function storedItem(Manager, Slot) {
		zeroParms();
		CallParms.writeS32(Slot);
		if(!callFunction(Manager, 'GetStoredInventory')) {
			return ptr(0);
		}
		return CallParms.add(8).readPointer();
	}

	function dropOne(Pawn, Slot, Count) {
		zeroParms();
		CallParms.writeS32(Slot);
		CallParms.add(4).writeU8(0);//bThrown
		CallParms.add(5).writeU8(0);//DropMethod
		CallParms.add(8).writeFloat(DropSpread);//OffsetVariation
		CallParms.add(12).writeFloat(DropSpread);
		CallParms.add(16).writeFloat(0);
		CallParms.add(20).writeFloat(0);//RotationVariation
		CallParms.add(24).writeFloat(180);
		CallParms.add(28).writeFloat(0);
		CallParms.add(32).writeS32(Count);//DropCount
		return callFunction(Pawn, 'DropInventory_Simulated');
	}

	function dropAll(Pawn) {
		var Manager = readPtr(Pawn, OffInventoryComponent);
		if(Manager.isNull()) {
			return;
		}
		zeroParms();
		if(!callFunction(Manager, 'GetStorageLimit')) {
			return;
		}
		var Limit = CallParms.readS32();
		if(Limit <= 0 || Limit > 64) {
			return;
		}
		for(var Slot = 0; Slot < Limit; Slot++) {
			var Item = storedItem(Manager, Slot);
			if(Item.isNull()) {
				continue;
			}
			var Quantity = readByte(Item, OffNumberOfItems);
			//повтор только пока количество уменьшается
			for(var Try = 0; Try < 10; Try++) {
				if(!dropOne(Pawn, Slot, Quantity > 0 ? Quantity : 1)) {
					return;
				}
				var After = storedItem(Manager, Slot);
				if(After.isNull() || !After.equals(Item)) {
					break;
				}
				var Left = readByte(After, OffNumberOfItems);
				if(Quantity <= 0 || Left <= 0 || Left >= Quantity) {
					break;
				}
				Quantity = Left;
			}
		}
	}

	//=============== учёт тел ===============

	function track(Pawn) {
		if(Pawn === null || Pawn.isNull()) {
			return;
		}
		var Key = Pawn.toString();
		if(BodyByKey[Key] !== undefined || getObjectClassName(Pawn) !== CorpseClass) {
			return;
		}
		if(PawnClassPtr.isNull()) {
			PawnClassPtr = ptr(Pawn.add(OffObjectClass).readPointer().toString());
		}
		var Entry = { Pawn : Pawn, Key : Key, DropAt : 0 };
		Bodies.push(Entry);
		BodyByKey[Key] = Entry;
		hookProcessEvent(Pawn);
	}

	function forget(Entry) {
		delete BodyByKey[Entry.Key];
		for(var i = 0; i < Bodies.length; i++) {
			if(Bodies[i] === Entry) {
				Bodies.splice(i, 1);
				return;
			}
		}
	}

	function poll(Now) {
		for(var i = Bodies.length - 1; i >= 0; i--) {
			var Entry = Bodies[i];
			//объект уже уничтожен и память переиспользована
			if(getObjectClassName(Entry.Pawn) !== CorpseClass) {
				forget(Entry);
				continue;
			}
			//вне лобби мод ничего не делает; тело просто перестаём отслеживать
			if(!isLobby(Entry.Pawn)) {
				forget(Entry);
				continue;
			}
			if(readByte(Entry.Pawn, OffDeathState) <= 0) {
				continue;
			}
			//пока игрок держит тело, камера на нём: ждём, когда отпустит
			if(!readPtr(Entry.Pawn, OffCharacterController).isNull()) {
				continue;
			}
			if(Entry.DropAt === 0) {
				Entry.DropAt = Now + DropItemsAfterSec * 1000;
				continue;
			}
			if(Now < Entry.DropAt) {
				continue;
			}

			if(DropItems) {
				try {
					dropAll(Entry.Pawn);
				}
				catch(e) {
					logError('вещи не выпали: ' + e);
				}
			}
			try {
				//SetLifeSpan(0) отменяет таймер, поэтому не меньше 0.1
				AActor_SetLifeSpan(Entry.Pawn, DespawnAfterDropSec > 0.1 ? DespawnAfterDropSec : 0.1);
			}
			catch(e) {
				logError('SetLifeSpan не удался: ' + e);
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
							BodyByKey[args[0].toString()] === undefined && args[0].add(OffDeathState).readU8() === 0) {
							track(ptr(args[0].toString()));
						}
					}
					catch(e) {
					}
					if(Bodies.length === 0) {
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
