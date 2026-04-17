package discovery

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/iam/types"

	"guardmap/internal/models"
)

type ResolvedRole struct {
	RoleARN    string
	RoleName   string
	Statements []models.PolicyStatement
}

type IAMDiscovery struct {
	client *iam.Client
}

func NewIAMDiscovery(ctx context.Context) (*IAMDiscovery, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("loading AWS config: %w", err)
	}
	return &IAMDiscovery{client: iam.NewFromConfig(cfg)}, nil
}

// ResolveRole fetches all policy statements (inline + managed) for a given role ARN.
func (d *IAMDiscovery) ResolveRole(ctx context.Context, roleARN string) (*ResolvedRole, error) {
	roleName, err := arnToRoleName(roleARN)
	if err != nil {
		return nil, err
	}

	var allStatements []models.PolicyStatement

	inlineStmts, err := d.fetchInlinePolicies(ctx, roleName)
	if err != nil {
		return nil, fmt.Errorf("inline policies for %s: %w", roleName, err)
	}
	allStatements = append(allStatements, inlineStmts...)

	managedStmts, err := d.fetchManagedPolicies(ctx, roleName)
	if err != nil {
		return nil, fmt.Errorf("managed policies for %s: %w", roleName, err)
	}
	allStatements = append(allStatements, managedStmts...)

	return &ResolvedRole{
		RoleARN:    roleARN,
		RoleName:   roleName,
		Statements: allStatements,
	}, nil
}

func (d *IAMDiscovery) fetchInlinePolicies(ctx context.Context, roleName string) ([]models.PolicyStatement, error) {
	paginator := iam.NewListRolePoliciesPaginator(d.client, &iam.ListRolePoliciesInput{
		RoleName: aws.String(roleName),
	})

	var stmts []models.PolicyStatement
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, policyName := range page.PolicyNames {
			doc, err := d.getRolePolicyDocument(ctx, roleName, policyName)
			if err != nil {
				continue
			}
			stmts = append(stmts, doc.Statements...)
		}
	}
	return stmts, nil
}

func (d *IAMDiscovery) fetchManagedPolicies(ctx context.Context, roleName string) ([]models.PolicyStatement, error) {
	paginator := iam.NewListAttachedRolePoliciesPaginator(d.client, &iam.ListAttachedRolePoliciesInput{
		RoleName: aws.String(roleName),
	})

	var stmts []models.PolicyStatement
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, policy := range page.AttachedPolicies {
			doc, err := d.getManagedPolicyDocument(ctx, policy)
			if err != nil {
				continue
			}
			stmts = append(stmts, doc.Statements...)
		}
	}
	return stmts, nil
}

func (d *IAMDiscovery) getRolePolicyDocument(ctx context.Context, roleName, policyName string) (*models.PolicyDocument, error) {
	out, err := d.client.GetRolePolicy(ctx, &iam.GetRolePolicyInput{
		RoleName:   aws.String(roleName),
		PolicyName: aws.String(policyName),
	})
	if err != nil {
		return nil, err
	}
	return parsePolicyDocument(aws.ToString(out.PolicyDocument))
}

func (d *IAMDiscovery) getManagedPolicyDocument(ctx context.Context, policy types.AttachedPolicy) (*models.PolicyDocument, error) {
	versionOut, err := d.client.GetPolicy(ctx, &iam.GetPolicyInput{
		PolicyArn: policy.PolicyArn,
	})
	if err != nil {
		return nil, err
	}

	docOut, err := d.client.GetPolicyVersion(ctx, &iam.GetPolicyVersionInput{
		PolicyArn: policy.PolicyArn,
		VersionId: versionOut.Policy.DefaultVersionId,
	})
	if err != nil {
		return nil, err
	}

	return parsePolicyDocument(aws.ToString(docOut.PolicyVersion.Document))
}

// parsePolicyDocument handles URL-encoded JSON returned by IAM APIs.
func parsePolicyDocument(raw string) (*models.PolicyDocument, error) {
	decoded, err := url.QueryUnescape(raw)
	if err != nil {
		decoded = raw
	}

	// IAM Action field can be string OR []string - normalize with a raw pass
	var rawDoc struct {
		Version   string `json:"Version"`
		Statement []struct {
			Effect   string          `json:"Effect"`
			Action   json.RawMessage `json:"Action"`
			Resource json.RawMessage `json:"Resource"`
		} `json:"Statement"`
	}
	if err := json.Unmarshal([]byte(decoded), &rawDoc); err != nil {
		return nil, fmt.Errorf("unmarshal policy: %w", err)
	}

	doc := &models.PolicyDocument{Version: rawDoc.Version}
	for _, s := range rawDoc.Statement {
		stmt := models.PolicyStatement{
			Effect:    s.Effect,
			Actions:   jsonRawToStringSlice(s.Action),
			Resources: jsonRawToStringSlice(s.Resource),
		}
		doc.Statements = append(doc.Statements, stmt)
	}
	return doc, nil
}

func jsonRawToStringSlice(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	// Try array first
	var arr []string
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr
	}
	// Fall back to single string
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return []string{s}
	}
	return nil
}

func arnToRoleName(arn string) (string, error) {
	// arn:aws:iam::123456789012:role/my-role  OR  arn:aws:iam::123456789012:role/path/my-role
	parts := strings.Split(arn, ":")
	if len(parts) < 6 || !strings.HasPrefix(parts[5], "role/") {
		return "", fmt.Errorf("invalid IAM role ARN: %s", arn)
	}
	segments := strings.Split(parts[5], "/")
	return segments[len(segments)-1], nil
}

// ClassifyAccess returns the highest access level found in a list of actions.
func ClassifyAccess(actions []string) models.AccessLevel {
	for _, a := range actions {
		if a == "*" || strings.HasSuffix(a, ":*") {
			return models.AccessFull
		}
	}
	writeVerbs := []string{"Put", "Create", "Update", "Delete", "Write", "Modify", "Attach", "Detach", "Set", "Upload", "Publish", "Send", "Terminate"}
	for _, a := range actions {
		parts := strings.SplitN(a, ":", 2)
		if len(parts) != 2 {
			continue
		}
		verb := parts[1]
		for _, w := range writeVerbs {
			if strings.HasPrefix(verb, w) {
				return models.AccessWrite
			}
		}
	}
	return models.AccessRead
}

// ServiceFromARN extracts a human-readable AWS service label from a resource ARN.
func ServiceFromARN(resourceARN string) string {
	if resourceARN == "*" {
		return "All AWS Resources"
	}
	parts := strings.Split(resourceARN, ":")
	if len(parts) < 3 {
		return resourceARN
	}
	service := parts[2]
	switch service {
	case "s3":
		return "S3:" + parts[len(parts)-1]
	case "rds":
		return "RDS:" + parts[len(parts)-1]
	case "dynamodb":
		return "DynamoDB:" + parts[len(parts)-1]
	case "secretsmanager":
		return "SecretsManager:" + parts[len(parts)-1]
	case "kms":
		return "KMS:" + parts[len(parts)-1]
	case "sqs":
		return "SQS:" + parts[len(parts)-1]
	case "sns":
		return "SNS:" + parts[len(parts)-1]
	default:
		return strings.ToUpper(service) + ":" + parts[len(parts)-1]
	}
}
