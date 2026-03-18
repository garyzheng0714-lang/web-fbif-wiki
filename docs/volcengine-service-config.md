FBIF智能客服
问答
服务 ID：
kb-service-b989dd842fb8767a
描述：
解答关于FBIF相关问题
API 调用
服务 ID 、API Key 和调试参数等已自动填入到示例代码中，复制到本地，快捷调用你的服务
复制示例代码
Python 调用示例
Java 调用示例
Go 调用示例
package main

import (
    "bufio"
    "bytes"
    "encoding/json"
    "fmt"
    "io/ioutil"
    "net/http"
    "net/url"
    "strings"
    "time"
)

var KnowledgeBaseDomain = "api-knowledgebase.mlp.cn-beijing.volces.com" // 知识库域名
var ServiceChatPath = "/api/knowledge/service/chat"                     // 支持知识服务的知识库检索接口
var APIKey = "your api key"                                             // 用于知识服务鉴权的apikey
var ServiceResourceID = "kb-service-b989dd842fb8767a"                   // 您在平台上创建的知识服务ID

type ServiceChatRequest struct {
    ServiceResourceID string         `json:"service_resource_id,omitempty"` //要检索的知识服务ID
    Stream            bool           `json:"stream"`                        // 仅针对生成类型的知识服务生效，默认为流式返回，false则为非流式返回
    Messages          []MessageParam `json:"messages"`                      // 多轮对话信息Message数组，拼接的多轮对话message的role顺序如下：[user, assistant, user...]，最后一个元素需保证是当前轮次提问，角色为user
    QueryParam        QueryParamInfo `json:"query_param,omitempty"`         // 检索附加过滤条件，在创建知识服务时如果您也配置了过滤条件，那么和该附加条件一起生效，逻辑为AND
}

type QueryParamInfo struct {
    DocFilter interface{} `json:"doc_filter"`
}

type MessageParam struct {
    Role    string      `json:"role"`
    Content interface{} `json:"content"`
}

type ServiceChatResponse struct {
    Code    int64                              `json:"code"`
    Message string                             `json:"message,omitempty"`
    Data    *CollectionServiceChatResponseData `json:"data,omitempty"`
}

type CollectionServiceChatResponseData struct {
    CollectionSearchKnowledgeResponseData
    *CollectionChatCompletionResponseData
}

type CollectionSearchKnowledgeResponseData struct {
    Count        int32                           `json:"count"`
    RewriteQuery string                          `json:"rewrite_query,omitempty"`
    TokenUsage   *TotalTokenUsage                `json:"token_usage,omitempty"`
    ResultList   []*CollectionSearchResponseItem `json:"result_list,omitempty"`
}

// 检索接口各个阶段模型调用量详情，详细介绍见官方文档
type TotalTokenUsage struct {
    EmbeddingUsage *ModelTokenUsage `json:"embedding_token_usage,omitempty"`
    RerankUsage    *int64           `json:"rerank_token_usage,omitempty"`
    LLMUsage       *ModelTokenUsage `json:"llm_token_usage,omitempty"`
    RewriteUsage   *ModelTokenUsage `json:"rewrite_token_usage,omitempty"`
}

// 检索接口返回切片的详情，详细介绍见官方文档
type CollectionSearchResponseItem struct {
    Id                  string                              `json:"id"`
    Content             string                              `json:"content"`
    MdContent           string                              `json:"md_content,omitempty"`
    Score               float64                             `json:"score"`
    PointId             string                              `json:"point_id"`
    OriginText          string                              `json:"origin_text,omitempty"`
    OriginalQuestion    string                              `json:"original_question,omitempty"`
    ChunkTitle          string                              `json:"chunk_title,omitempty"`
    ChunkId             int                                 `json:"chunk_id"`
    ProcessTime         int64                               `json:"process_time"`
    RerankScore         float64                             `json:"rerank_score,omitempty"`
    DocInfo             CollectionSearchResponseItemDocInfo `json:"doc_info,omitempty"`
    RecallPosition      int32                               `json:"recall_position"`
    RerankPosition      int32                               `json:"rerank_position,omitempty"`
    ChunkType           string                              `json:"chunk_type,omitempty"`
    ChunkSource         string                              `json:"chunk_source,omitempty"`
    UpdateTime          int64                               `json:"update_time"`
    ChunkAttachmentList []ChunkAttachment                   `json:"chunk_attachment,omitempty"`
    TableChunkFields    []PointTableChunkField              `json:"table_chunk_fields,omitempty"`
    OriginalCoordinate  *ChunkPositions                     `json:"original_coordinate,omitempty"`
}

type CollectionSearchResponseItemDocInfo struct {
    Docid      string `json:"doc_id"`
    DocName    string `json:"doc_name"`
    CreateTime int64  `json:"create_time"`
    DocType    string `json:"doc_type"`
    DocMeta    string `json:"doc_meta,omitempty"`
    Source     string `json:"source"`
    Title      string `json:"title,omitempty"`
}

type ChunkAttachment struct {
    UUID    string `json:"uuid,omitempty"`
    Caption string `json:"caption"`
    Type    string `json:"type"`
    Link    string `json:"link,omitempty"`
}

type PointTableChunkField struct {
    FieldName  string      `json:"field_name"`
    FieldValue interface{} `json:"field_value"`
}

type ChunkPositions struct {
    PageNo []int       `json:"page_no"`
    BBox   [][]float64 `json:"bbox"`
}

type CollectionChatCompletionResponseData struct {
    GenerateAnswer   string  `json:"generated_answer"`
    ReasoningContent string  `json:"reasoning_content,omitempty"`
    Prompt           *string `json:"prompt,omitempty"`
    End              bool    `json:"end,omitempty"`
}

type ModelTokenUsage struct {
    PromptTokens     int64 `json:"prompt_tokens"`     // 请求文本的分词数
    CompletionTokens int64 `json:"completion_tokens"` // 生成文本的分词数, 对话模型才有值, 其他模型都是0
    TotalTokens      int64 `json:"total_tokens"`      // PromptTokens + CompletionTokens
}

// scanDoubleCRLF 是一个 bufio.SplitFunc，用于分隔 \r\n\r\n
func scanDoubleCRLF(data []byte, atEOF bool) (advance int, token []byte, err error) {
    // 查找 \r\n\r\n 分隔符
    if i := bytes.Index(data, []byte("\r\n\r\n")); i >= 0 {
       // 返回位置后的分隔符
       return i + 4, data[0:i], nil
    }
    if atEOF && strings.Contains(string(data), "\"end\":true") {
       return len(data), data, nil
    }
    return 0, nil, nil
}

func PrepareRequest(method string, path string, body []byte) *http.Request {
    u := url.URL{
       Scheme: "http",
       Host:   KnowledgeBaseDomain,
       Path:   path,
    }
    req, _ := http.NewRequest(strings.ToUpper(method), u.String(), bytes.NewReader(body))
    req.Header.Add("Accept", "application/json")
    req.Header.Add("Content-Type", "application/json")
    req.Header.Add("Host", KnowledgeBaseDomain)
    req.Header.Add("Authorization", "Bearer "+APIKey)
    return req
}

func GenerateServiceChatReq(stream bool) *ServiceChatRequest {
    return &ServiceChatRequest{
       ServiceResourceID: ServiceResourceID,
       Stream:            stream,
       Messages: []MessageParam{
          // 当query为纯文本时，user的content为query文本
          {
             Role:    "user",
             Content: "29元套餐电话卡",
          },
          // 当query包含图片时，user的content为list结构
          //{
          // Role:    "user",
          // Content: []map[string]interface{}{
          //    {
          //       "text": "29元套餐电话卡",
          //       "type": "text",
          //    },
          //    {
          //       "image_url": map[string]string{
          //          "url": "请传入可访问的图片URL或者Base64编码",
          //       },
          //       "type": "image_url",
          //    },
          // },
          //},
       },
       //QueryParam: QueryParamInfo{},
    }
}

// KnowledgeServiceChat 知识服务-非流式返回(检索类型的知识服务或者生成类型的知识服务非流式使用该函数)
func KnowledgeServiceChat(serviceChatReq *ServiceChatRequest) error {
    serviceChatReqBytes, _ := json.Marshal(serviceChatReq)
    req := PrepareRequest("POST", ServiceChatPath, serviceChatReqBytes)
    client := &http.Client{Timeout: 600 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
       fmt.Printf("请求失败: %s\n", err.Error())
       return err
    }
    defer resp.Body.Close()

    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
       return err
    }
    fmt.Printf("本次请求返回信息: %s\n", string(body))

    var serviceChatResp *ServiceChatResponse
    err = json.Unmarshal(body, &serviceChatResp)
    if err != nil {
       return err
    }
    return nil
}

// KnowledgeServiceChatStream 生成类型知识服务-流式返回（生成类型的知识服务流式返回使用该函数）
func KnowledgeServiceChatStream(serviceChatReq *ServiceChatRequest) (err error) {
    chatCompletionReqParamsBytes, _ := json.Marshal(serviceChatReq)
    request := PrepareRequest("POST", ServiceChatPath, chatCompletionReqParamsBytes)
    client := &http.Client{
       Timeout: time.Second * 600,
    }
    request.Header.Set("Accept", "text/event-stream")
    resp, err := client.Do(request)
    if err != nil {
       fmt.Printf("请求失败: %s\n", err.Error())
       return err
    }
    defer resp.Body.Close()
    // 读取流式返回
    scanner := bufio.NewScanner(resp.Body)
    // 指定分隔符函数
    scanner.Split(scanDoubleCRLF)

    var answerBuilder strings.Builder
    var usage TotalTokenUsage

    buf := make([]byte, 0, 150*1024)
    scanner.Buffer(buf, 1500*1024) // 可以按需调整scanner的大小

    // 读取数据
    for scanner.Scan() {
       streamLine := scanner.Text()
       fmt.Println(streamLine)
       if len(streamLine) < 5 {
          continue
       }
       streamJson := streamLine[5:]
       var serviceChatResponse ServiceChatResponse
       err := json.Unmarshal([]byte(streamJson), &serviceChatResponse)
       if err != nil {
          fmt.Printf("请求失败: %s\n", err.Error())
          return err
       }
       if serviceChatResponse.Data.TokenUsage != nil {
          usage = *serviceChatResponse.Data.TokenUsage
       }
       if serviceChatResponse.Data.End {
          fmt.Println("流式输出返回结束")
          break
       }
       answerBuilder.WriteString(serviceChatResponse.Data.GenerateAnswer)
    }

    if err := scanner.Err(); err != nil {
       fmt.Printf("请求失败: %s\n", err.Error())
       return err
    }
    usageStr, _ := json.Marshal(usage)
    fmt.Printf("本次请求Token使用情况: %s\n", usageStr)
    fmt.Printf("LLM回答: %s\n", answerBuilder.String())
    return nil
}

func main() {
    // 以下两个函数根据需要二选一
    //纯检索类型的知识服务或者生成类型知识服务非流式返回使用该函数
    KnowledgeServiceChat(GenerateServiceChatReq(false))
    //生成类型的知识服务流式返回 使用该函数
    KnowledgeServiceChatStream(GenerateServiceChatReq(true))
}
服务信息
记录服务发布时的知识库、参数配置和可用 API Key 信息
关联知识库
FBIF
root/Gary_FBiF
创建于  2026-03-18 13:25
知识检索模式｜参数
结果返回数量	10
问题改写	启用
重排模型	doubao-seed-rerank
文档聚合排序	启用
Dense Weight	0.5
进入重排数量	25
阈值过滤	未开启
阈值	-
知识问答模式｜参数
回答模型	Doubao-seed-1-8
模型版本	251228
深度思考	开启
MaxTokens	4096
Temperature	1
拼接邻近文本片数量	0
文本片参数	5(切片 ID,文档名称,文档标题,切片标题,切片内容)
Prompt	

# 任务
你是一位在线客服，你的首要任务是通过巧妙的话术回复用户的问题，你需要根据「参考资料」来回答接下来的「用户问题」，这些信息在 <context></context> XML tags 之内，你需要根据参考资料给出准确，简洁的回答。

你的回答要满足以下要求：
1. 回答内容必须在参考资料范围内，尽可能简洁地回答问题，不能做任何参考资料以外的扩展解释。
2. 回答中需要根据客户问题和参考资料保持与客户的友好沟通。
3. 如果参考资料不能帮助你回答用户问题，告知客户无法回答该问题，并引导客户提供更加详细的信息。
4. 如果用户输入了图片内容，也可以结合用户的图片内容来回答用户问题，即使与参考资料无关。
5. 为了保密需要，委婉地拒绝回答有关参考资料的文档名称或文档作者等问题。

# 任务执行
现在请你根据提供的参考资料，遵循限制来回答用户的问题，你的回答需要准确和完整。

# 参考资料

注意：「参考资料」可以为文本、图片等多种内容
- 文本资料是一段文本
- 图片资料则是图片内容，可能会包括关于图片的描述性文本
<context>
{{ .retrieved_chunks }}
</context>
参考资料中提到的图片按上传顺序排列，请结合图片与文本信息综合回答问题。如参考资料中没有图片，请仅根据参考资料中的文本信息回答问题。

# 引用要求
1. 当可以回答时，在句子末尾适当引用相关参考资料，每个参考资料引用格式必须使用<reference>标签对，例如: <reference data-ref="{{point_id}}"></reference>
2. 当告知客户无法回答时，不允许引用任何参考资料
3. 'data-ref' 字段表示对应参考资料的 point_id
4. 'point_id' 取值必须来源于参考资料对应的'point_id' 后的id号
5. 适当合并引用，当引用项相同可以合并引用，只在引用内容结束添加一个引用标签。

# 配图要求
1. 首先对参考资料的每个图片内容含义深入理解，然后从所有图片中筛选出与回答上下文直接关联的图片，在回答中的合适位置插入作为配图，图像内容必须支持直接的可视化说明问题的答案。若参考资料中无适配图片，或图片仅是间接性关联，则省略配图。
2. 使用 <illustration> 标签对表示插图，例如: <illustration data-ref="{{point_id}}"></illustration>，其中 'point_id' 字段表示对应图片的 point_id，每个配图标签对必须另起一行，相同的图片（以'point_id'区分）只允许使用一次。
3. 'point_id' 取值必须来源于参考资料，形如“_sys_auto_gen_doc_id-1005563729285435073--1”，请注意务必不要虚构，'point_id'值必须与参考资料完全一致

下面是「用户问题」，可以为文本和图片内容，你需要根据上面的「参考资料」来回答接下来的「用户问题」
参数配置暂不支持修改，如需调整，可
应用该参数发布新服务
可用 API Key (1)
FBIF智能客服火山知识库APIKEY
9026f416-850c-4f2b-843f-7dafb457f5f2