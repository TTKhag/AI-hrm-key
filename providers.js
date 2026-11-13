/* Chỉnh sửa tại đây để thêm/sửa nhà cung cấp. type: gemini | openai (tương thích OpenAI) | anthropic | cohere.
   "models" chỉ là gợi ý ban đầu: nhập model ID tuỳ ý hoặc bấm "Tải danh sách model" trong Cấu hình AI để lấy danh sách hiện hành từ API. */
const PROVIDERS={
 gemini:{name:'Google Gemini',type:'gemini',base:'https://generativelanguage.googleapis.com/v1beta',models:['gemini-2.5-flash']},
 openai:{name:'OpenAI',type:'openai',base:'https://api.openai.com/v1',models:['gpt-4o-mini']},
 anthropic:{name:'Anthropic Claude',type:'anthropic',base:'https://api.anthropic.com/v1',models:['claude-haiku-4-5']},
 deepseek:{name:'DeepSeek',type:'openai',base:'https://api.deepseek.com',models:['deepseek-chat']},
 groq:{name:'Groq',type:'openai',base:'https://api.groq.com/openai/v1',models:['llama-3.3-70b-versatile']},
 xai:{name:'xAI Grok',type:'openai',base:'https://api.x.ai/v1',models:[]},
 mistral:{name:'Mistral AI',type:'openai',base:'https://api.mistral.ai/v1',models:['mistral-small-latest']},
 qwen:{name:'Qwen (Alibaba Cloud)',type:'openai',base:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',models:['qwen-plus']},
 qwen_cn:{name:'Qwen (Alibaba Cloud – Trung Quốc)',type:'openai',base:'https://dashscope.aliyuncs.com/compatible-mode/v1',models:['qwen-plus']},
 openrouter:{name:'OpenRouter',type:'openai',base:'https://openrouter.ai/api/v1',models:[]},
 cohere:{name:'Cohere',type:'cohere',base:'https://api.cohere.com',models:['command-r-plus']}};
