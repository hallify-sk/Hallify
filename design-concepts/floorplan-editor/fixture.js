export const tableTypes = [
  { id: 'banquet', name: 'Banquet table', shape: 'rect', width: 2, height: 1, radius: 1, max_chairs: 6 },
  { id: 'round', name: 'Round table', shape: 'round', width: 1.6, height: 1.6, radius: .8, max_chairs: 8 },
];
const rect = (x,y,w,h) => [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
export function fixture(mode = 'event') {
  const guests = Array.from({length: 20}, (_,i) => ({id:`g${i}`, firstName: ['Anna','Martin','Lucia','Peter','Eva'][i%5], lastName: ['Novák','Kováč','Horváth','Varga'][Math.floor(i/5)], group: ['Family','Friends','Colleagues','Hosts'][Math.floor(i/5)], note: i===0 ? 'Vegetarian meal' : ''}));
  return {version:2, guests: mode === 'event' ? guests : [], floors:[{
    id:'main', name:'Main hall', bounds:{x:0,y:0,w:12,h:8},
    walls:[{id:'w1',points:rect(0,0,12,.15)},{id:'w2',points:rect(0,0,.15,8)},{id:'w3',points:rect(11.85,0,.15,8)},{id:'w4',points:rect(0,7.85,4,.15)},{id:'w5',points:rect(6,7.85,6,.15)}],
    zones:[{id:'stage',label:'Stage',color:'#a78bfa',points:rect(4,.4,4,1.4)},{id:'dance',label:'Dance floor',color:'#34d399',points:rect(4.5,3,3,3)}],
    tables: mode === 'venue' ? [] : [[2.3,3],[9.5,3],[2.3,5.8],[9.5,5.8]].map(([x,y],i)=>({id:`t${i}`,x,y,width:2,height:1,radius:1,shape:'rect',chairs:6,rotation:0,label:`Table ${String(i+1).padStart(2,'0')}`,chairsTop:3,chairsBottom:3,chairsLeft:0,chairsRight:0,chairSpacing:.15,assignments:Array.from({length:6},(_,j)=>mode==='event'&&i*6+j<12?`g${i*6+j}`:null),typeId:'banquet'})),
    seats: mode === 'venue' ? [] : [{id:'seat1',x:1,y:1,rotation:0,assignment:null},{id:'seat2',x:1.75,y:1,rotation:0,assignment:null}],
  },{id:'balcony',name:'Balcony',bounds:{x:0,y:0,w:8,h:4},walls:[],zones:[],tables:[],seats:[]}]};
}
