export const categories = {
  royalty: 'Royalty & Payments', metadata: 'ISBN & Metadata Issues', printing: 'Printing & Quality',
  distribution: 'Distribution & Availability', production: 'Book Status & Production Updates', general: 'General Inquiry'
};
export const priorities = ['Low','Medium','High','Critical'];

export function classifyRules(text) {
  const value = String(text).toLowerCase(); let category = 'general';
  if (/royalt|payout|payment|paid|earning|disburs/.test(value)) category = 'royalty';
  else if (/isbn|barcode|metadata|author name|wrong title/.test(value)) category = 'metadata';
  else if (/print|paper|binding|misalign|blur|quality|cover/.test(value)) category = 'printing';
  else if (/amazon|flipkart|unavailable|distribution|listing|stock sync/.test(value)) category = 'distribution';
  else if (/production|typeset|proof|cover design|status|manuscript/.test(value)) category = 'production';
  let priority = 'Low';
  if (/6 months|overdue|wrong isbn|different isbn|defect|damaged|not received|urgent|withdraw/.test(value)) priority = 'Critical';
  else if (/royalt|payout|payment|misprint|misalign|unavailable|delay/.test(value)) priority = 'High';
  else if (value.length > 80) priority = 'Medium';
  return { category, category_label: categories[category], priority, priority_score: priorities.indexOf(priority)+1, classification_source:'rules', classification_confidence:null };
}

export async function classifyTicket({subject,description,apiKey=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL||'gpt-4o-mini'}) {
  const fallback=classifyRules(`${subject} ${description}`);
  if(!apiKey)return fallback;
  const system=`Classify a BookLeaf author support ticket. Choose exactly one category: royalty (royalties/payments), metadata (ISBN/barcode/book metadata), printing (physical print/binding/quality), distribution (marketplace availability/listing/stock sync), production (publishing progress/stages), general (anything else). Choose exactly one priority: Critical (severe, time-sensitive, prolonged non-payment, incorrect live ISBN, major defects); High (payment delays, significant fulfillment or production delays); Medium (action needed but no immediate/severe harm); Low (general information or minor change). A six-month royalty delay is higher than a routine author bio update. Return JSON only: {"category":"royalty|metadata|printing|distribution|production|general","priority":"Low|Medium|High|Critical","confidence":0.0}. Do not draft a reply.`;
  try {
    const response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',signal:AbortSignal.timeout(10000),
      headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
      body:JSON.stringify({model,max_tokens:100,temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({subject,description})}]})
    });
    if(!response.ok)throw new Error(`provider status ${response.status}`);
    const payload=await response.json();
    const result=JSON.parse(payload.choices?.[0]?.message?.content||'{}');
    if(!categories[result.category]||!priorities.includes(result.priority))throw new Error('invalid classification response');
    const confidence=Number(result.confidence);
    return {category:result.category,category_label:categories[result.category],priority:result.priority,priority_score:priorities.indexOf(result.priority)+1,classification_source:'ai',classification_confidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):null};
  } catch(error) {
    console.error('AI ticket classification unavailable; using rule fallback:',error.message);
    return fallback;
  }
}
