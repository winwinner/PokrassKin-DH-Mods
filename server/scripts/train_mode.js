/*
	Training mode / Тренировочный режим - PokrassKin DH Mods
	https://github.com/winwinner/PokrassKin-DH-Mods
	EN: every player spawns with a flintlock, ammo, wood axe, syringe, whetstone and
	powderkeg (STARTING_ITEMS); spells recharge fast with no cooldown; crafting is
	near-instant; ammo and syringes are not used up; a downed player gets up at full
	health after ReviveDelayMs and cannot be finished off; a fist swing heals to full
	and resets hunger and warmth; everyone sees "<attacker> (<hp>) kill <victim>".
	Log: train_mode.log in Binaries/Win64.
	RU: каждый появляется с пистолетом, патронами, топором, шприцем, точилом и
	бочонком пороха (STARTING_ITEMS); заклинания быстро заряжаются и без отката;
	крафт почти мгновенный; патроны и шприцы не тратятся; упавший встаёт с полным
	здоровьем через ReviveDelayMs, добить его нельзя; замах кулаками лечит до
	полного и сбрасывает голод и холод; всем приходит "<кто> (<hp>) kill <кого>".
	Original code: author unknown (see NOTICE.md); knockdown/heal part is ours.
	Исходный код: автор неизвестен (см. NOTICE.md); нокдаун и лечение - наши.
*/

// スペルクールタイム無し、マナ最小値Lv1、弾と注射減らない、マスケ即空き、クラフト0秒

const base = Module.findBaseAddress(
	'DreadHungerServer-Win64-Shipping.exe'
);

const UDH_InventoryManager_AddInventory = new NativeFunction(
	base.add(0xDBC040), 'void',
	['pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'int8', 'pointer'],
	'win64'
);
const UClass_GetPrivateStaticClass = new NativeFunction(base.add(0x11F02E0), 'pointer', [], 'win64');
const StaticFindObject = new NativeFunction(base.add(0x137AAA0), 'pointer', ['pointer', 'pointer', 'pointer', 'int8'], 'win64');
const UDH_InventoryManager_SetStorageLimit = new NativeFunction(base.add(0xDE3DA0), 'void', ['pointer', 'int32'], 'win64');

function findClassByName(className) {
	const buf = Memory.alloc((className.length + 1) * 2);
	buf.writeUtf16String(className);
	return StaticFindObject(UClass_GetPrivateStaticClass(), ptr(0xFFFFFFFFFFFFFFFF), buf, 0);
}

function initItemState(state) {
	state.writeU32(Math.floor(Math.random() * 25565));
	state.add(0x4).writeU8(1);
	state.add(0x8).writeFloat(1.0);
	state.add(0xC).writeU8(0);
	state.add(0xD).writeU8(0);
	state.add(0xE).writeU8(0);
	state.add(0x10).writePointer(ptr(0));
	state.add(0x18).writePointer(ptr(0));
	state.add(0x20).writePointer(ptr(0));
	state.add(0x28).writePointer(ptr(0));
	state.add(0x30).writePointer(ptr(0));
}

function giveInventory(HumanCharacter, className) {
	const InventoryComponent = HumanCharacter.add(0x808).readPointer();
	if (InventoryComponent.isNull()) return;
	const ItemClass = findClassByName(className);
	const arr = Memory.alloc(16 + 56);
	arr.writePointer(arr.add(16));
	arr.add(8).writeU32(1);
	arr.add(12).writeU32(1);
	initItemState(arr.readPointer());
	const buf = Memory.alloc(8);
	buf.writeU32(0);
	buf.add(4).writeU32(0xffffffff);
	UDH_InventoryManager_AddInventory(InventoryComponent, ItemClass, arr, buf, buf.add(4), 0, ptr(0));
}

const POWDERKEG  = '/Game/Blueprints/Inventory/Powderkeg/BP_Powderkeg_Inventory.BP_Powderkeg_Inventory_C';
const FLINTLOCK  = '/Game/Blueprints/Inventory/Flintlock/BP_Flintlock_Inventory.BP_Flintlock_Inventory_C';
const AMMO       = '/Game/Blueprints/Inventory/Flintlock/BP_Flintlock_Ammo_Inventory.BP_Flintlock_Ammo_Inventory_C';
const WOODAXE    = '/Game/Blueprints/Inventory/WoodAxe/BP_WoodAxe_Inventory.BP_WoodAxe_Inventory_C';
const SYRINGE    = '/Game/Blueprints/Inventory/Syringe/BP_Syringe_Inventory.BP_Syringe_Inventory_C';
const WHETSTONE  = '/Game/Blueprints/Inventory/Metals/BP_Whetstone_Inventory.BP_Whetstone_Inventory_C';

const STARTING_ITEMS = [FLINTLOCK, AMMO, AMMO, WOODAXE, SYRINGE, WHETSTONE, POWDERKEG];

const adhHumanCharacterAddStartingInventoryAddr = base.add(0xd46f10);
const adhSpellManagerCastSpellAddr = base.add(0xe634f0);

function resetSpells(SpellManager) {
	if (SpellManager.isNull()) return;
	SpellManager.add(0x284).writeFloat(0.24);
}

Interceptor.attach(adhHumanCharacterAddStartingInventoryAddr, {
	onEnter(args) {
		const PlayerState = args[0].add(0x240).readPointer();
		resetSpells(PlayerState.add(0x488).readPointer());
		this.HumanCharacter = args[0];
	},
	onLeave() {
		const ic = this.HumanCharacter.add(0x808).readPointer();
		if (ic.isNull()) return;
		const prevLimit = ic.add(0x240).readS32();
		UDH_InventoryManager_SetStorageLimit(ic, 20);
		for (const path of STARTING_ITEMS) {
			giveInventory(this.HumanCharacter, path);
		}
		UDH_InventoryManager_SetStorageLimit(ic, prevLimit);
	}
});

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArraySize(tArray) {
	return tArray.add(8).readU32();
}

function getArrayItemAddr(tArray, size, index) {
	const ArrNum = getArraySize(tArray);
	if (index > ArrNum) return null;
	return tArray.readPointer().add(index * size);
}

async function Reducecooling(SpellManager) {
	await sleep(1000);
	const SpellCooldowns = SpellManager.add(0x2a8);
	for (let i = 0; i < getArraySize(SpellCooldowns); i++) {
		const SpellCooldown = getArrayItemAddr(SpellCooldowns, 16, i);
		const ServerUsedTime = SpellCooldown.add(8);
		ServerUsedTime.writeFloat(ServerUsedTime.readFloat() - 300);
	}
	resetSpells(SpellManager);
}

Interceptor.attach(adhSpellManagerCastSpellAddr, {
	onEnter: (args) => {
		const SpellManager = args[0];
		Reducecooling(SpellManager);
	}
});

// craft即終了
const udhCraftingComponentStartNewProject = base.add(0xdac790);
Interceptor.attach(udhCraftingComponentStartNewProject, {
	onLeave(retval) {
		if (!retval.isNull()) {
			//   const pUdhCraftingRecipe = retval.add(0x28);
			const pRemainingTime = retval.add(0x48);

			pRemainingTime.writeFloat(0.001);
		}
	}
});

// マスケ即空き
const adhArmoryDoorTickAddr = base.add(0xe73240);
Interceptor.attach(adhArmoryDoorTickAddr, {
	onLeave() {
		// なんでこれで上手くいくか知らん
		this.context.rax = 1;
	}
});

// インベントリからアイテムが消える(1→0になる)時呼ばれる
const decreaseItemStack = base.add(0xdc56d0);
function replaceDecreaseFunc() {
	Interceptor.replace(
		decreaseItemStack,
		new NativeCallback(
			(ptr, delta) => {
				// console.log(`delta: ${delta}`)
				Interceptor.revert(decreaseItemStack);
			},
			'void',
			['pointer', 'int', 'bool', 'bool']
		)
	);
}

// 自分含む何かしらのオブジェクトに攻撃当てると呼ばれる
// args[0]=thisはADH_Weapon_Melee型でこいつはADH_Weapon → ADH_Inventoryと継承してる
// でこいつの直後にdecreaseが呼ばれるから注射をmeleehitさせた時だけ次回のdecreaseの呼び出しを無視させる
const onMeleeWeaponHit = base.add(0xf0ad20);

Interceptor.attach(onMeleeWeaponHit, {
	onEnter(args) {
		// ADH_Weapon_Melee this*, FHitResult hit*, u8 AttackState*
		// 注射だと41 アヘンは40
		const invType = args[0].add(0x290).readU8();
		if (invType === 41) {
			replaceDecreaseFunc();
		}

		// console.log("onMeleeHit",invType)
	}
});

// 弾減らない
const adhWeaponRangedOnReloadComplete = base.add(0xe0e600);
Interceptor.attach(adhWeaponRangedOnReloadComplete, {
	onEnter() {
		// 長物は対応する弾を減らした後親クラスであるInventoryのreloadCompleteを呼ぶ
		// その時弾を減らす処理をするので注射同様次のアイテム減らす処理を飛ばす
		replaceDecreaseFunc();
		// console.log("debug on")
	}
});

/*
	Нокдаун, подъём и лечение кулаками. Перенесено из клиентского
	[Dock Patch] Lobby Duel.js (папка lobby), адреса перенесены на серверную сборку.

	- Когда у персонажа кончается первая линейка здоровья, игра штатно роняет его
	  в нокдаун. Если вырубил игрок, всем приходит 'Вася (74) kill Петя'. Через
	  ReviveDelayMs персонаж поднимается штатным Revive и доливается до MaxHealth.
	  Пока лежит, урон по нему гасится тем же гейтом, которым игра выключает урон в
	  лобби, - добить нельзя.
	- Замах кулаками лечит замахнувшегося до MaxHealth, а голод и тепло возвращает к
	  тем, что были при появлении. Другое оружие не лечит.

	Гейт урона в начале ADH_HumanCharacter::TakeDamage (0xD73DB0):
		cmp byte [rcx+0x11D1], 0 / call 0xE93530 / mov [rsi+0x11D0], al
		cmp byte [rsi+0x11D0], 0 / je ... / xorps xmm6, xmm6   <- урон обнуляется
	На время вызова ставим 0x11D1=1, 0x11D0=1 и возвращаем как было.

	Замах: 0xE24C50 - виртуальное «использовать» у ADH_Weapon_Melee. Сначала зовёт
	родительский Use (0xDEB340), и если тот разрешил замах (вернул 1), снимает с
	владельца (+0x268) стамину StaminaCost (+0x908), потом спрашивает HasMeleeTrace
	(переходник 0xF0ABE0) и только тогда запускает трассу. Первая попытка висела на
	0xDF8B60, но в живом матче он не сработал ни на кулаках, ни на топоре, а
	HasMeleeTrace на каждом замахе был - так и нашёлся 0xE24C50. Лечим на
	выходе из 0xE24C50, если вернулась 1 и оружие - кулаки, по имени класса.

	Голод и тепло - нативные сеттеры UFunction SetCurrentHunger/SetCurrentWarmth,
	найдены по таблице нативных функций класса (exec-переходники 0xEC7500/0xEC7580):
		0xD6E6A0 SetCurrentHunger: CurrentHunger +0x1008, зажат в [0, MaxHunger +0x1010].
		0xD6E700 SetCurrentWarmth: CurrentWarmth +0x1014, снизу MinWarmth +0x1018.
	Ставим стартовые значения InitialHunger (+0x100c) и InitialWarmth (+0x101c) - с
	ними персонаж появляется (0xD49150), так что направление шкалы неважно.
	Первая версия ставила голод в MaxHunger, и игрок умер от голода: голод в тике
	(0xD74D60) растёт на HungerIncreasePerSecond, то есть 0 - это сытость. Проверено
	логом в матче: стартовые значения голод 0 и тепло 1, после замаха так и есть.
*/
const ReviveDelayMs = 1500;
const FistsClassName = 'BP_Fists_Inventory_C';

const ADH_HumanCharacter_TakeDamage = base.add(0xD73DB0);
const ADH_Weapon_Melee_Use = base.add(0xE24C50);
const ADH_GameState_Tick = base.add(0xDAD420);
const ADH_HumanCharacter_Revive = new NativeFunction(base.add(0xD6C8E0), 'void', ['pointer'], 'win64');
const ADH_HumanCharacter_SetCurrentHealth = new NativeFunction(base.add(0xD6E620), 'void', ['pointer', 'float'], 'win64');
const ADH_HumanCharacter_SetCurrentHunger = new NativeFunction(base.add(0xD6E6A0), 'void', ['pointer', 'float'], 'win64');
const ADH_HumanCharacter_SetCurrentWarmth = new NativeFunction(base.add(0xD6E700), 'void', ['pointer', 'float'], 'win64');
const ADH_HumanCharacter_SetIncapacitated = new NativeFunction(base.add(0xD6F820), 'void', ['pointer', 'uint8'], 'win64');
const FName_GetPlainNameString = new NativeFunction(base.add(0x11604F0), 'void', ['pointer', 'pointer'], 'win64');
const FName_FName = new NativeFunction(base.add(0x1158F20), 'void', ['pointer', 'pointer', 'int8'], 'win64');
const FText_FromName = new NativeFunction(base.add(0x1096370), 'pointer', ['pointer', 'pointer'], 'win64');
const ADH_PlayerController_ReceiveThrallMessage = new NativeFunction(base.add(0xEE7810), 'void', ['pointer', 'pointer', 'pointer'], 'win64');
const UGameplayStatics_GetPlayerController = new NativeFunction(base.add(0x25630D0), 'pointer', ['pointer', 'int32'], 'win64');

const OffMaxHealth = 0x7e0;
const OffHealth = 0x94c;
const OffIncapacitated = 0xe10;
const OffInitialHunger = 0x100c;
const OffInitialWarmth = 0x101c;
const OffDeathState = 0x818;
const OffNoDamageCached = 0x11d0;
const OffNoDamageKnown = 0x11d1;
const OffPawnPlayerState = 0x240;
const OffDHPlayerState = 0xc40;
const OffPlayerName = 0x300;
const OffControllerPlayerState = 0x228;
const OffControllerPawn = 0x250;
const OffInventoryHumanOwner = 0x268;
const OffInventoryHumanInstigator = 0x270;

const Downed = {};// указатель персонажа строкой -> { Character, At }
const FistClasses = {};// указатель класса строкой -> кулаки или нет

function logError(Info) {
	try {
		const f = new File('train_mode.log', 'a');
		f.write('[TrainMode] ' + Info + '\n');
		f.close();
	}
	catch (e) {
	}
}

function safeFloat(Object, Offset) {
	try {
		return Object.add(Offset).readFloat();
	}
	catch (e) {
		return NaN;
	}
}

function safeByte(Object, Offset) {
	try {
		return Object.add(Offset).readU8();
	}
	catch (e) {
		return -1;
	}
}

function getObjectName(UObject) {
	if (UObject === null || UObject.isNull()) return '';
	try {
		const NameBuffer = Memory.alloc(16 + 512);
		NameBuffer.writePointer(NameBuffer.add(16));
		NameBuffer.add(8).writeU32(0);
		NameBuffer.add(12).writeU32(256);
		FName_GetPlainNameString(UObject.add(0x18), NameBuffer);
		return NameBuffer.readPointer().readUtf16String();
	}
	catch (e) {
		return '';
	}
}

function getObjectClassName(UObject) {
	if (UObject === null || UObject.isNull()) return '';
	try {
		return getObjectName(UObject.add(0x10).readPointer());
	}
	catch (e) {
		return '';
	}
}

function isHumanCharacter(Object) {
	return getObjectClassName(Object).indexOf('HumanCharacter') >= 0;
}

function fullHealth(Character) {
	let Max = safeFloat(Character, OffMaxHealth);
	if (!isFinite(Max) || Max <= 0) Max = 100.0;
	ADH_HumanCharacter_SetCurrentHealth(Character, Max);
}

function restoreHungerAndWarmth(Character) {
	const Hunger = safeFloat(Character, OffInitialHunger);
	if (isFinite(Hunger) && Hunger >= 0) {
		ADH_HumanCharacter_SetCurrentHunger(Character, Hunger);
	}
	const Warmth = safeFloat(Character, OffInitialWarmth);
	if (isFinite(Warmth)) {
		ADH_HumanCharacter_SetCurrentWarmth(Character, Warmth);
	}
}

//=============== имена и сообщения ===============

function readFString(Address) {
	try {
		const Data = Address.readPointer();
		const Length = Address.add(8).readU32();
		if (Data.isNull() || Length < 1 || Length > 64) return null;
		return Data.readUtf16String(Length).replace(/\0+$/, '').trim() || null;
	}
	catch (e) {
		return null;
	}
}

function nameFromPlayerState(PlayerState) {
	if (PlayerState === null || PlayerState.isNull()) return null;
	return readFString(PlayerState.add(OffPlayerName));
}

function characterName(Character) {
	if (Character === null || Character.isNull()) return null;
	for (const Offset of [OffPawnPlayerState, OffDHPlayerState]) {
		try {
			const Name = nameFromPlayerState(Character.add(Offset).readPointer());
			if (Name) return Name;
		}
		catch (e) {
		}
	}
	return null;
}

// бьющий персонаж: обычно это сам Causer, для снаряда - пешка инстигатора
function attackerCharacter(Causer, Instigator) {
	if (isHumanCharacter(Causer)) return Causer;
	try {
		if (!Instigator.isNull()) {
			const Pawn = Instigator.add(OffControllerPawn).readPointer();
			if (isHumanCharacter(Pawn)) return Pawn;
		}
	}
	catch (e) {
	}
	return null;
}

function attackerName(Attacker, Instigator) {
	const Name = characterName(Attacker);
	if (Name) return Name;
	try {
		if (!Instigator.isNull()) {
			return nameFromPlayerState(Instigator.add(OffControllerPlayerState).readPointer());
		}
	}
	catch (e) {
	}
	return null;
}

function healthText(Character) {
	if (Character === null) return '';
	const Health = safeFloat(Character, OffHealth);
	if (!isFinite(Health) || Health < 0 || Health > 1000) return '';
	return ' (' + Math.round(Health) + ')';
}

function makeFText(Text) {
	const NameBuffer = Memory.alloc(8);
	const Source = Memory.alloc((Text.length + 4) * 2);
	Source.writeUtf16String(Text);
	FName_FName(NameBuffer, Source, 1);
	const TextBuffer = Memory.alloc(24);
	FText_FromName(TextBuffer, NameBuffer);
	return TextBuffer;
}

function announceToAll(WorldContext, Text) {
	try {
		const Message = makeFText(Text);
		let Misses = 0;
		for (let i = 0; i < 16 && Misses < 4; i++) {
			const Controller = UGameplayStatics_GetPlayerController(WorldContext, i);
			if (Controller.isNull()) {
				Misses++;
				continue;
			}
			Misses = 0;
			ADH_PlayerController_ReceiveThrallMessage(Controller, Message, ptr(0));
		}
	}
	catch (e) {
		logError('ошибка рассылки: ' + e);
	}
}

//=============== нокдаун и подъём ===============

function revive(Key) {
	const Character = Downed[Key].Character;
	delete Downed[Key];
	try {
		// за время ожидания игрок мог выйти, умереть или его подняли руками
		if (!isHumanCharacter(Character) || safeByte(Character, OffDeathState) !== 0) return;
		if (safeByte(Character, OffIncapacitated) !== 1) return;
		ADH_HumanCharacter_Revive(Character);
		if (safeByte(Character, OffIncapacitated) !== 0) {
			ADH_HumanCharacter_SetIncapacitated(Character, 0);
		}
		// Revive поднимает с половиной здоровья
		fullHealth(Character);
	}
	catch (e) {
		logError('ошибка подъёма ' + Character + ': ' + e);
	}
}

Interceptor.attach(ADH_HumanCharacter_TakeDamage, {
	onEnter(args) {
		try {
			this.Character = ptr(args[0].toString());
			this.Instigator = ptr(args[3].toString());
			this.Causer = ptr(args[4].toString());
			this.IncapBefore = safeByte(this.Character, OffIncapacitated);
			// лежачего не добить: включаем игре её же «урон выключен»
			if (this.IncapBefore === 1) {
				this.SavedCached = safeByte(this.Character, OffNoDamageCached);
				this.SavedKnown = safeByte(this.Character, OffNoDamageKnown);
				this.Character.add(OffNoDamageKnown).writeU8(1);
				this.Character.add(OffNoDamageCached).writeU8(1);
				this.Wrote = true;
			}
		}
		catch (e) {
			logError('ошибка onEnter: ' + e);
		}
	},
	onLeave() {
		try {
			if (this.Character === undefined) return;
			if (this.Wrote) {
				this.Character.add(OffNoDamageCached).writeU8(this.SavedCached);
				this.Character.add(OffNoDamageKnown).writeU8(this.SavedKnown);
				return;
			}
			const Key = this.Character.toString();
			if (this.IncapBefore !== 0 || safeByte(this.Character, OffIncapacitated) !== 1 || Downed[Key]) return;
			Downed[Key] = { Character: this.Character, At: Date.now() };

			// подпись только когда вырубил игрок: холод, голод и звери молча
			const Attacker = attackerCharacter(this.Causer, this.Instigator);
			const Name = attackerName(Attacker, this.Instigator);
			if (Name) {
				announceToAll(this.Character,
					'   ' + Name + healthText(Attacker) + ' kill ' + (characterName(this.Character) || 'кто-то'));
			}
		}
		catch (e) {
			logError('ошибка onLeave: ' + e);
		}
	}
});

Interceptor.attach(ADH_GameState_Tick, {
	onEnter() {
		const Now = Date.now();
		for (const Key in Downed) {
			if (Now - Downed[Key].At >= ReviveDelayMs) revive(Key);
		}
	}
});

//=============== лечение кулаками ===============

function isFists(Weapon) {
	try {
		const Clazz = Weapon.add(0x10).readPointer().toString();
		if (FistClasses[Clazz] === undefined) {
			FistClasses[Clazz] = getObjectClassName(Weapon) === FistsClassName;
		}
		return FistClasses[Clazz];
	}
	catch (e) {
		return false;
	}
}

Interceptor.attach(ADH_Weapon_Melee_Use, {
	onEnter(args) {
		this.Weapon = ptr(args[0].toString());
	},
	onLeave(retval) {
		try {
			const Weapon = this.Weapon;
			if ((retval.toUInt32() & 0xff) === 0 || !isFists(Weapon)) return;
			for (const Offset of [OffInventoryHumanOwner, OffInventoryHumanInstigator]) {
				const Owner = Weapon.add(Offset).readPointer();
				if (!isHumanCharacter(Owner)) continue;
				if (safeByte(Owner, OffIncapacitated) === 0 && safeByte(Owner, OffDeathState) === 0) {
					fullHealth(Owner);
					restoreHungerAndWarmth(Owner);
				}
				return;
			}
		}
		catch (e) {
			logError('ошибка лечения: ' + e);
		}
	}
});
