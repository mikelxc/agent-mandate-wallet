import { assert, beforeEach, clearStore, dataSourceMock, newMockEvent, test } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, DataSourceContext, crypto, ethereum } from "@graphprotocol/graph-ts";
import { AccountCreated } from "../generated/Registry/Registry";
import { Transfer } from "../generated/Token/Token";
import { UserOperationEvent } from "../generated/EntryPoint/EntryPoint";
import { handleAccountCreated, handleTransfer, handleUserOperation } from "../src/mapping";
const account = "0x1111111111111111111111111111111111111111";
const owner = "0x2222222222222222222222222222222222222222";
const merchant = "0x3333333333333333333333333333333333333333";
const token = "0x3600000000000000000000000000000000000000";
const ep = "0x433709009b8330fda32311df1c2afa402ed8d009";
const tx = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const opHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const userTopic = "UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)";
function int(n:i32):BigInt { return BigInt.fromI32(n); }
function eventParam(name:string, value:ethereum.Value):ethereum.EventParam { return new ethereum.EventParam(name,value); }
function register():void {
  let event=changetype<AccountCreated>(newMockEvent());
  event.parameters=[eventParam("tokenId",ethereum.Value.fromUnsignedBigInt(int(1))),eventParam("owner",ethereum.Value.fromAddress(Address.fromString(owner))),eventParam("account",ethereum.Value.fromAddress(Address.fromString(account))),eventParam("label",ethereum.Value.fromString("desk")),eventParam("identityNode",ethereum.Value.fromFixedBytes(Bytes.fromHexString(opHash)))];
  handleAccountCreated(event);
}
function topic(text:string):Bytes { return Bytes.fromByteArray(crypto.keccak256(Bytes.fromUTF8(text))); }
function log(index:i32, emitter:string, signature:string, transfer:bool=false):ethereum.Log {
  let topics=[topic(signature)];
  let data=Bytes.fromHexString("0x");
  if(transfer){topics.push(Bytes.fromHexString("0x000000000000000000000000"+owner.slice(2)));topics.push(Bytes.fromHexString("0x000000000000000000000000"+merchant.slice(2)));data=ethereum.encode(ethereum.Value.fromUnsignedBigInt(int(100)))!;}
  return new ethereum.Log(Address.fromString(emitter),topics,data,Bytes.fromHexString(opHash),Bytes.fromI32(1),Bytes.fromHexString(tx),int(0),int(index),int(index),"mined",null);
}
function userOp(success:bool, logs:ethereum.Log[]):UserOperationEvent {
  let event=changetype<UserOperationEvent>(newMockEvent());event.address=Address.fromString(ep);event.transaction.hash=Bytes.fromHexString(tx);event.logIndex=int(9);
  event.parameters=[eventParam("userOpHash",ethereum.Value.fromFixedBytes(Bytes.fromHexString(opHash))),eventParam("sender",ethereum.Value.fromAddress(Address.fromString(account))),eventParam("paymaster",ethereum.Value.fromAddress(Address.fromString(owner))),eventParam("nonce",ethereum.Value.fromUnsignedBigInt(int(0))),eventParam("success",ethereum.Value.fromBoolean(success)),eventParam("actualGasCost",ethereum.Value.fromUnsignedBigInt(int(1))),eventParam("actualGasUsed",ethereum.Value.fromUnsignedBigInt(int(1)))];
  let receipt=event.receipt!;receipt.logs=logs;event.receipt=receipt;return event;
}
beforeEach(()=>{clearStore();let context=new DataSourceContext();context.setString("chainId","11155111");context.setBytes("token",Bytes.fromHexString(token));dataSourceMock.setContext(context);});
test("registration enables direct transfers but does not backfill earlier events",()=>{
  let event=changetype<Transfer>(newMockEvent());event.transaction.hash=Bytes.fromHexString(tx);event.address=Address.fromString(token);
  event.parameters=[eventParam("from",ethereum.Value.fromAddress(Address.fromString(account))),eventParam("to",ethereum.Value.fromAddress(Address.fromString(merchant))),eventParam("value",ethereum.Value.fromUnsignedBigInt(int(25)))];
  handleTransfer(event);assert.entityCount("PaymentTransfer",0);register();handleTransfer(event);
  assert.fieldEquals("Account",account,"label","desk");assert.fieldEquals("PaymentTransfer","11155111:"+tx+":1","amount","25");
});
test("failed user operation is retained and never infers receipt token effects",()=>{register();handleUserOperation(userOp(false,[log(1,ep,"BeforeExecution()"),log(2,token,"Transfer(address,address,uint256)",true)]));assert.fieldEquals("UserOperation","11155111:"+tx+":9","success","false");assert.entityCount("PaymentTransfer",0);});
test("bundled receipt attribution excludes prior and later user operations and other tokens",()=>{
  register();handleUserOperation(userOp(true,[log(1,ep,"BeforeExecution()"),log(2,token,"Transfer(address,address,uint256)",true),log(3,ep,userTopic),log(4,token,"Transfer(address,address,uint256)",true),log(5,merchant,"Transfer(address,address,uint256)",true),log(9,ep,userTopic),log(10,token,"Transfer(address,address,uint256)",true)]));
  assert.entityCount("PaymentTransfer",1);assert.fieldEquals("PaymentTransfer","11155111:"+tx+":4","account",account);assert.fieldEquals("PaymentTransfer","11155111:"+tx+":4","from",owner);assert.fieldEquals("PaymentTransfer","11155111:"+tx+":4","userOpHash",opHash);
});
test("missing EntryPoint execution boundary does not invent a payment",()=>{register();handleUserOperation(userOp(true,[log(2,token,"Transfer(address,address,uint256)",true)]));assert.entityCount("UserOperation",1);assert.entityCount("PaymentTransfer",0);});
test("unregistered UserOperation sender is outside indexed account coverage",()=>{handleUserOperation(userOp(true,[log(1,ep,"BeforeExecution()"),log(2,token,"Transfer(address,address,uint256)",true)]));assert.entityCount("UserOperation",0);assert.entityCount("PaymentTransfer",0);});
