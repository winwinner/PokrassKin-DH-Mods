/*
	Instant quests / Квесты сразу - PokrassKin DH Mods
	https://github.com/winwinner/PokrassKin-DH-Mods
	EN: QUEST_START_DELAY_MS (40 s) after the round starts every player gets a quest
	directly, without the quest scroll. On completion the player receives random
	items from the weighted tables below: TaskRewardsnumber for the crew,
	ThrallTaskRewardsnumber for thralls. EXPERIMENTAL: not yet confirmed in a full
	live round.
	RU: через QUEST_START_DELAY_MS (40 с) после начала раунда каждый игрок сразу
	получает квест, без свитка. За выполнение - случайные предметы из таблиц ниже
	(чем больше weight, тем чаще): TaskRewardsnumber экипажу, ThrallTaskRewardsnumber
	предателям. ЭКСПЕРИМЕНТАЛЬНО: в полном живом раунде ещё не подтверждено.
	Original code: author unknown (see NOTICE.md); quest start rewrite is ours.
	Исходный код: автор неизвестен (см. NOTICE.md); новая выдача квестов - наша.
*/

//Number of items rewarded to good players
var TaskRewardsnumber = 2;

//Number of items rewarded to Thralls
var ThrallTaskRewardsnumber = 3;

//Reward table for good players
var InventoryTable = {
    '/Game/Blueprints/Inventory/Flintlock/BP_Flintlock_Inventory.BP_Flintlock_Inventory_C': { 'weight': 10 },//Pistol (Assembled)
    '/Game/Blueprints/Inventory/Sword/BP_Sword_Inventory.BP_Sword_Inventory_C': { 'weight': 10 },//Sword
	
    '/Game/Blueprints/Inventory/Lantern/BP_Lantern_Inventory.BP_Lantern_Inventory_C': { 'weight': 40 },//Lantern
    '/Game/Blueprints/Inventory/Bow/BP_Bow_Inventory.BP_Bow_Inventory_C': { 'weight': 10 },      //Bow
    '/Game/Blueprints/Inventory/Flint/BP_GunParts_Inventory.BP_GunParts_Inventory_C': { 'weight': 20 },      //Pistol(Disassembled)
   
    '/Game/Blueprints/Inventory/WoodAxe/BP_WoodAxe_Inventory.BP_WoodAxe_Inventory_C': { 'weight': 30 },      //WoodenAxe
    '/Game/Blueprints/Inventory/IceAxe/BP_IceAxe_Inventory.BP_IceAxe_Inventory_C': { 'weight': 30 },      //IceAxe
   
    '/Game/Blueprints/Inventory/Shovel/BP_Shovel_Inventory.BP_Shovel_Inventory_C': { 'weight': 30 },      //Showel
        
    '/Game/Blueprints/Inventory/Coal/BP_Coal_Inventory.BP_Coal_Inventory_C': { 'weight': 20 },      //Coal
   
       
    '/Game/Blueprints/Inventory/Syringe/BP_Syringe_Inventory.BP_Syringe_Inventory_C': { 'weight': 40 },      //Syringe
    '/Game/Blueprints/Inventory/Poison/BP_Antidote_Inventory.BP_Antidote_Inventory_C': { 'weight': 20 },      //Antidote
   
    
    '/Game/Blueprints/Inventory/Meat/BP_Stew_Inventory.BP_Stew_Inventory_C': { 'weight': 40 },      //Stew
    '/Game/Blueprints/Inventory/Tea/BP_Tea_Inventory.BP_Tea_Inventory_C': { 'weight': 40 },      //Tea
    '/Game/Blueprints/Inventory/Metals/BP_Whetstone_Inventory.BP_Whetstone_Inventory_C': { 'weight': 60 },      //Whetstone
    '/Game/Blueprints/Inventory/BearTrap/BP_BearTrap_Inventory.BP_BearTrap_Inventory_C': { 'weight': 30 },      //BearTrap
    
    '/Game/Blueprints/Inventory/Powderkeg/BP_CoalBarrel_Inventory.BP_CoalBarrel_Inventory_C': { 'weight': 30 },      //Coal
    '/Game/Blueprints/Environment/Nitro/BP_Nitro_Inventory.BP_Nitro_Inventory_C': { 'weight': 1 },      //Nitro (hehe)
    '/Game/Blueprints/Inventory/LockPick/BP_SkeletonKey_Inventory.BP_SkeletonKey_Inventory_C': { 'weight': 60 },      //Key
};

//ThrallItemList
var ThrallInventoryTable = {
    '/Game/Blueprints/Inventory/Flintlock/BP_Flintlock_Inventory.BP_Flintlock_Inventory_C': { 'weight': 20 },//Pistol (Assembled)
	'/Game/Blueprints/Inventory/Flint/BP_GunParts_Inventory.BP_GunParts_Inventory_C': { 'weight': 20 },      //Pistol(Disassembled) 
    '/Game/Blueprints/Inventory/Musket/BP_Musket_Inventory.BP_Musket_Inventory_C': { 'weight': 20 },//Musket 
    
	'/Game/Blueprints/Inventory/Sword/BP_Sword_Inventory.BP_Sword_Inventory_C': { 'weight': 30 },//Sword
    '/Game/Blueprints/Inventory/WoodAxe/BP_WoodAxe_Inventory.BP_WoodAxe_Inventory_C': { 'weight': 30 },      //WoodenAxe
    '/Game/Blueprints/Inventory/IceAxe/BP_IceAxe_Inventory.BP_IceAxe_Inventory_C': { 'weight': 30 },      //IceAxe
   
    '/Game/Blueprints/Inventory/Shovel/BP_Shovel_Inventory.BP_Shovel_Inventory_C': { 'weight': 20 },      //Showel
   
    '/Game/Blueprints/Inventory/Syringe/BP_Syringe_Inventory.BP_Syringe_Inventory_C': { 'weight': 20 },      //Syringe
    '/Game/Blueprints/Inventory/Poison/BP_Antidote_Inventory.BP_Antidote_Inventory_C': { 'weight': 20 },      //Antidote
   
   
    '/Game/Blueprints/Inventory/Meat/BP_Stew_Inventory.BP_Stew_Inventory_C': { 'weight': 30 },      //Stew
    '/Game/Blueprints/Inventory/Tea/BP_Tea_Inventory.BP_Tea_Inventory_C': { 'weight': 30 },      //Tea
	
    '/Game/Blueprints/Inventory/Metals/BP_Whetstone_Inventory.BP_Whetstone_Inventory_C': { 'weight': 30 },      //WhetStone
   
    '/Game/Blueprints/Inventory/Powderkeg/BP_CoalBarrel_Inventory.BP_CoalBarrel_Inventory_C': { 'weight': 30 },      //CoalBarrel
    '/Game/Blueprints/Inventory/Powderkeg/BP_Powderkeg_Inventory.BP_Powderkeg_Inventory_C': { 'weight': 60 },      //Powderkeg
    '/Game/Blueprints/Inventory/Poison/BP_Poison_Inventory.BP_Poison_Inventory_C': { 'weight': 20 },      //Poison
    '/Game/Blueprints/Environment/Nitro/BP_Nitro_Inventory.BP_Nitro_Inventory_C': { 'weight': 10 },      //Nitro
    '/Game/Blueprints/Inventory/LockPick/BP_SkeletonKey_Inventory.BP_SkeletonKey_Inventory_C': { 'weight': 40 },      //Key
};



var base = Module.findBaseAddress('DreadHungerServer-Win64-Shipping.exe');
var UDH_InventoryManager_AddInventory = new NativeFunction(base.add(0xDBC040), 'void', ['pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'int8', 'pointer'], 'win64');
var UClass_GetPrivateStaticClass = new NativeFunction(base.add(0x11F02E0), 'pointer', [], 'win64');
var StaticFindObject = new NativeFunction(base.add(0x137AAA0), 'pointer', ['pointer', 'pointer', 'pointer', 'int8'], 'win64');
var UDH_InventoryManager_SetStorageLimit = new NativeFunction(base.add(0xDE3DA0), 'void', ['pointer', 'int32'], 'win64');
var ADH_GameState_Tick = base.add(0xDAD420);
function getArraySize(TArray) {
    return TArray.add(8).readU32();
}

function getArrayItemAddr(TArray, size, index) {
    var ArrNum = getArraySize(TArray);
    if (index > ArrNum)
        return null;
    return TArray.readPointer().add(index * size);
}

function getString(FString) {
    var Size = getArraySize(FString);
    return getArrayItemAddr(FString, 0, 0).readUtf16String(Size);
}
function findClassByName(ClassName) {
    return findObjectByName(ClassName, UClass_GetPrivateStaticClass());
}
function findObjectByName(ObjectName, Clazz) {
    var Buffer = Memory.alloc((ObjectName.length + 1) * 2);
    Buffer.writeUtf16String(ObjectName);
    return StaticFindObject(Clazz, ptr(0xFFFFFFFFFFFFFFFF), Buffer, 0);
}
function chooseMultipleInventoryItems(inventoryTable, count) {
    var selectedItems = [];

    for (let i = 0; i < count; i++) {
        var totalWeight = Object.values(inventoryTable).reduce((sum, item) => sum + item.weight, 0);

        var randomValue = Math.random() * totalWeight;

        let cumulativeWeight = 0;
        for (var [itemName, item] of Object.entries(inventoryTable)) {
            cumulativeWeight += item.weight;
            if (randomValue <= cumulativeWeight) {
                selectedItems.push(itemName);
                break;
            }
        }
    }
    return selectedItems;
}
function InitItemState(State) {
    var prand = Math.floor(Math.random() * 25565);
    State.writeU32(prand);
    State.add(0x4).writeU8(1);
    State.add(0x8).writeFloat(1.0);
    State.add(0xC).writeU8(0);
    State.add(0xD).writeU8(0);
    State.add(0xE).writeU8(0);
    State.add(0x10).writePointer(ptr(0));
    State.add(0x18).writePointer(ptr(0));
    State.add(0x20).writePointer(ptr(0));
    State.add(0x28).writePointer(ptr(0));
    State.add(0x30).writePointer(ptr(0));
}
function giveInventory(PlayerState, ClassName) {
    var HumanCharacter = PlayerState.add(0x280).readPointer();
    if (HumanCharacter.isNull()) {
        return;
    }
    var ItemClass = findClassByName(ClassName);
    var InventoryComponent = HumanCharacter.add(0x808).readPointer();
    var Array = Memory.alloc(16 + 56);
    Array.writePointer(Array.add(16));
    Array.add(8).writeU32(1);
    Array.add(12).writeU32(1);
    InitItemState(Array.readPointer());
    var Buffer = Memory.alloc(8);
    Buffer.writeU32(0);
    Buffer.add(4).writeU32(0xffffffff);
    UDH_InventoryManager_AddInventory(InventoryComponent, ItemClass, Array, Buffer, Buffer.add(4), 0, ptr(0));
}
function GetPlayerAddress(GameState) {
    var PlayerArray = GameState.add(0x238);
    var PlayerStateArray = []
    for (var i = 0; i < getArraySize(PlayerArray); i++) {
        var PlayerState = getArrayItemAddr(PlayerArray, 8, i).readPointer();
        PlayerStateArray.push(PlayerState);
    }
    return PlayerStateArray;
}

function GetPlayerBackPack(InventoryComponent) {
    var StorageLimit = InventoryComponent.add(0x240);
    return Memory.readInt(StorageLimit);
}


var QuestCompletedMap = {};

// Quests are started directly, without the scroll item. BP_Quest_Inventory's
// only job was to call ADH_GameState::GiveQuest(PlayerState) from its
// LoadFromInventory event - which fires on a player-to-player inventory move,
// never on a server-side AddInventory. That is why players had to drop the
// scroll into storage and take it back. GiveQuest picks a random quest the
// player is eligible for (thrall/crew) and loads it asynchronously, so
// PlayerState+0x478 fills in a frame or more later; until then a repeat call
// would start a duplicate load, hence QUEST_RETRY_MS.
var ADH_GameState_GiveQuest = new NativeFunction(base.add(0xD973E0), 'void', ['pointer', 'pointer'], 'win64');
var FName_ToString = new NativeFunction(base.add(0x1166E70), 'void', ['pointer', 'pointer'], 'win64');
var QUEST_START_DELAY_MS = 40000;  // after InProgress (roles are dealt by then)
var QUEST_RETRY_MS = 5000;
var InProgressAt = 0;
var QuestRequestedAt = {};

function getMatchState(GameState) {
    var Out = Memory.alloc(16);
    FName_ToString(GameState.add(0x270), Out);
    var Len = Out.add(8).readU32();
    return Len ? Out.readPointer().readUtf16String(Len).split(String.fromCharCode(0))[0] : '';
}

function startQuests(GameState, PlayerStates, Now) {
    if (getMatchState(GameState) !== 'InProgress') {
        InProgressAt = 0;
        return;
    }
    if (InProgressAt === 0) {
        InProgressAt = Now;
    }
    if (Now - InProgressAt < QUEST_START_DELAY_MS) {
        return;
    }
    for (var i = 0; i < PlayerStates.length; i++) {
        var PS = PlayerStates[i];
        if (PS.isNull() || PS.add(0x280).readPointer().isNull() || !PS.add(0x478).readPointer().isNull()) {
            continue;
        }
        var Key = PS.toString();
        if (QuestRequestedAt[Key] && Now - QuestRequestedAt[Key] < QUEST_RETRY_MS) {
            continue;
        }
        QuestRequestedAt[Key] = Now;
        ADH_GameState_GiveQuest(GameState, PS);
    }
}

// Quest completion is polled, not hooked, so keep the poll cheap: once a second
// instead of every tick. A reward lands up to a second late, which nobody sees.
var QUEST_POLL_MS = 1000;
var LastQuestPoll = 0;
Interceptor.attach(ADH_GameState_Tick, {
    onEnter: function(args) {
        var Now = Date.now();
        if (Now - LastQuestPoll < QUEST_POLL_MS) {
            return;
        }
        LastQuestPoll = Now;

        var PlayerState = GetPlayerAddress(args[0]);
        startQuests(args[0], PlayerState, Now);
        for (var i = 0; i < PlayerState.length; i++) {
            if (QuestCompletedMap[PlayerState[i]]) {
                continue;
            }
            var QuestState = PlayerState[i].add(0x478).readPointer();
            if (QuestState.isNull() || !QuestState.add(0x228).readU32()) {
                continue;
            }
            // No body right now (dead, disconnected, not spawned yet): try
            // again on a later poll instead of reading through a null pointer.
            var HumanCharacter = PlayerState[i].add(0x280).readPointer();
            if (HumanCharacter.isNull()) {
                continue;
            }
            var InventoryComponent = HumanCharacter.add(0x808).readPointer();
            var IsThrall = PlayerState[i].add(0x572).readU8();
            var TaskRewards = IsThrall
                ? chooseMultipleInventoryItems(ThrallInventoryTable, ThrallTaskRewardsnumber)
                : chooseMultipleInventoryItems(InventoryTable, TaskRewardsnumber);

            var BackPack = GetPlayerBackPack(InventoryComponent);
            UDH_InventoryManager_SetStorageLimit(InventoryComponent, 20);
            for (var j = 0; j < TaskRewards.length; j++) {
                giveInventory(PlayerState[i], TaskRewards[j]);
            }
            UDH_InventoryManager_SetStorageLimit(InventoryComponent, BackPack);
            QuestCompletedMap[PlayerState[i]] = true;
        }
    }
});
