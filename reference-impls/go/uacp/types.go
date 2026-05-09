package uacp

type UACPDocument struct {
	UACP       string         `json:"uacp"`
	ID         string         `json:"id"`
	Tool       any            `json:"tool"`
	Messages   []Message      `json:"messages"`
	ToolChain  []string       `json:"tool_chain,omitempty"`
	Model      any            `json:"model,omitempty"`
	Title      string         `json:"title,omitempty"`
	Extensions []string       `json:"extensions,omitempty"`
	CreatedAt  string         `json:"created_at,omitempty"`
	UpdatedAt  string         `json:"updated_at,omitempty"`
	Tags       []string       `json:"tags,omitempty"`
	Project    string         `json:"project,omitempty"`
	Branches   []string       `json:"branches,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

type Message struct {
	Role           string         `json:"role"`
	Content        any            `json:"content"`
	ID             string         `json:"id,omitempty"`
	ParentID       string         `json:"parent_id,omitempty"`
	Timestamp      string         `json:"timestamp,omitempty"`
	Model          any            `json:"model,omitempty"`
	Status         string         `json:"status,omitempty"`
	ToolCalls      []ToolCall     `json:"tool_calls,omitempty"`
	CallID         string         `json:"call_id,omitempty"`
	ToolCallID     string         `json:"tool_call_id,omitempty"`
	Name           string         `json:"name,omitempty"`
	Attachments    []Attachment   `json:"attachments,omitempty"`
	Citations      []Citation     `json:"citations,omitempty"`
	Artifacts      []Artifact     `json:"artifacts,omitempty"`
	Redactions     *Redactions    `json:"redactions,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
	Provenance     string         `json:"provenance,omitempty"`
	Confidence     *float64       `json:"confidence,omitempty"`
	ProvenanceSrc  string         `json:"provenance_source,omitempty"`
}

type ContentBlock struct {
	Type      string  `json:"type"`
	Text      string  `json:"text,omitempty"`
	Code      string  `json:"code,omitempty"`
	ID        string  `json:"id,omitempty"`
	URL       string  `json:"url,omitempty"`
	Data      string  `json:"data,omitempty"`
	Language  string  `json:"language,omitempty"`
	Filename  string  `json:"filename,omitempty"`
	Signature string  `json:"signature,omitempty"`
	MimeType  string  `json:"mime_type,omitempty"`
	Title     string  `json:"title,omitempty"`
}

type Citation struct {
	Span   []int         `json:"span"`
	Source CitationSource `json:"source"`
}

type CitationSource struct {
	URL     string `json:"url"`
	Title   string `json:"title,omitempty"`
	Snippet string `json:"snippet,omitempty"`
}

type Artifact struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Language  string `json:"language,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type Attachment struct {
	ID        string `json:"id"`
	MimeType  string `json:"mime_type"`
	Filename  string `json:"filename,omitempty"`
	SizeBytes *int64 `json:"size_bytes,omitempty"`
	URL       string `json:"url,omitempty"`
	Data      string `json:"data,omitempty"`
	SHA256    string `json:"sha256,omitempty"`
}

type ToolCall struct {
	CallID    string `json:"call_id"`
	Name      string `json:"name"`
	Arguments any    `json:"arguments,omitempty"`
}

type Redactions struct {
	Count             int      `json:"count"`
	PlaceholderFormat string   `json:"placeholder_format"`
	Categories        []string `json:"categories,omitempty"`
}
