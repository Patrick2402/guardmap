export interface ControlInfo {
  description: string
  why: string
  remediation: string[]
}

export const CONTROL_INFO: Record<string, ControlInfo> = {
  // ── CIS 5.1 RBAC ──────────────────────────────────────────────────────────
  'CIS 5.1.1': {
    description: 'The cluster-admin ClusterRole grants unrestricted access to every resource in every namespace. It should only be bound to subjects with a genuine, documented need for cluster-wide administrative access.',
    why: 'A compromised subject with cluster-admin can create privileged pods, read all Secrets, modify RBAC rules, and permanently backdoor the cluster — effectively full infrastructure compromise with no further escalation needed.',
    remediation: [
      'Audit all bindings: kubectl get clusterrolebindings -o wide | grep cluster-admin',
      'Replace cluster-admin with a narrower ClusterRole granting only required API groups and verbs',
      'Use namespace-scoped RoleBindings where possible — most workloads need access only within their namespace',
      'For CI/CD pipelines, use workload identity (IRSA/Workload Identity) instead of service accounts with cluster-admin',
      'If break-glass access is needed, use a dedicated account gated behind MFA and audit logging, not a standing ClusterRoleBinding',
    ],
  },
  'CIS 5.1.2': {
    description: 'Kubernetes Secrets hold TLS certificates, database passwords, API tokens, and cloud credentials. A ClusterRole with get/list/watch on the secrets resource can read every secret in every namespace with a single API call.',
    why: 'An attacker who gains a pod with secret-read permissions can exfiltrate all credentials stored in etcd instantly — database passwords, IRSA tokens, TLS private keys — enabling broad lateral movement.',
    remediation: [
      'Use resourceNames to restrict access to specific secrets by name',
      'Prefer namespace-scoped Roles over ClusterRoles for any secret access',
      'Move sensitive credentials to AWS Secrets Manager or HashiCorp Vault — reduces what is in etcd',
      'Enable encryption at rest: configure EncryptionConfiguration for secrets in the kube-apiserver',
      'Audit secret access in Kubernetes audit logs for anomalous list/watch operations',
    ],
  },
  'CIS 5.1.3': {
    description: 'Wildcard (*) verbs or resources in RBAC rules silently expand permissions whenever Kubernetes adds new resource types during upgrades. A role with verbs: ["*"] on resources: ["*"] is functionally equivalent to cluster-admin.',
    why: 'Even narrower wildcards like verbs: ["*"] on deployments grant dangerous abilities such as delete or rollout. Wildcards make it impossible to reason about what a role can actually do.',
    remediation: [
      'Replace * verbs with explicit lists: ["get", "list", "watch"] or ["create", "update", "patch", "delete"]',
      'Replace * resources with specific API groups and resource names: ["apps/deployments", "core/pods"]',
      'Run kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa> to audit effective permissions',
      'Use rbac-police or audit2rbac to generate least-privilege roles from existing audit logs',
    ],
  },
  'CIS 5.1.4': {
    description: 'The ability to create or patch pods effectively grants arbitrary code execution in the cluster. A subject with this permission can create a privileged pod that mounts the host filesystem and escapes to the node.',
    why: 'Creating a pod with hostPID: true, privileged: true and a hostPath mount of / gives full node access. This is a well-known RBAC escape that bypasses Pod Security Standards entirely, even in the most restricted namespaces.',
    remediation: [
      'Remove create/patch verbs on pods from ClusterRoles unless strictly necessary',
      'If pod creation is required, use a namespace-scoped Role to limit blast radius to one namespace',
      'Enforce Pod Security Admission (PSA) to reject privileged pods even if RBAC allows creation',
      'Audit who can create pods: kubectl auth can-i create pods --as=system:serviceaccount:<ns>:<sa> -n <ns>',
    ],
  },
  'CIS 5.1.5': {
    description: 'Every namespace has a default ServiceAccount. Binding a role to it means every pod that does not explicitly set spec.serviceAccountName inherits those permissions — often unintentionally.',
    why: 'Developers frequently forget to set serviceAccountName. If the default SA has any RBAC permissions, every workload in the namespace silently gets them. A compromised pod anywhere in the namespace inherits all those permissions.',
    remediation: [
      'Create dedicated ServiceAccounts per workload: kubectl create sa <name>-sa -n <namespace>',
      'Set spec.serviceAccountName in all pod/deployment specs explicitly',
      'Set automountServiceAccountToken: false on the default ServiceAccount in every namespace',
      'kubectl patch serviceaccount default -p \'{"automountServiceAccountToken": false}\' -n <ns>',
    ],
  },
  'CIS 5.1.6': {
    description: 'By default Kubernetes mounts a ServiceAccount token into every pod at /var/run/secrets/kubernetes.io/serviceaccount/token. This token provides API access to the Kubernetes control plane even if the workload never uses it.',
    why: 'An attacker who compromises any container receives a valid Kubernetes API token. Even minimal-permission SAs can be used to discover cluster topology, read ConfigMaps, or enumerate other service accounts for further escalation.',
    remediation: [
      'Set automountServiceAccountToken: false at the pod spec level for workloads that do not call the K8s API',
      'Set it on the ServiceAccount object to apply as the default for all pods using that SA',
      'For IRSA workloads, always disable automount — AWS credentials arrive via projected volume, the K8s token is unnecessary',
      'Keep automounting only for operators, controllers, and workloads that explicitly use client-go',
    ],
  },
  'CIS 5.1.7': {
    description: 'The system:masters group is hardcoded in the Kubernetes API server to bypass all RBAC authorization checks entirely. Unlike cluster-admin, membership in system:masters cannot be restricted by any RBAC policy or admission webhook.',
    why: 'Adding any subject to system:masters creates an irrevocable backdoor that survives deletion of all ClusterRoleBindings. No audit policy, NetworkPolicy, or admission controller can limit what a system:masters member does.',
    remediation: [
      'Remove system:masters from all ClusterRoleBinding subjects immediately',
      'If cluster-admin access is needed, use the cluster-admin ClusterRole — it goes through RBAC and can be revoked',
      'Audit: kubectl get clusterrolebindings -o json | jq \'.items[] | select(.subjects[]?.name=="system:masters")\'',
      'Rotate credentials for any subject that was bound to system:masters',
    ],
  },
  'CIS 5.1.8': {
    description: 'The escalate verb allows granting permissions the subject does not personally have. The bind verb allows binding any ClusterRole to any subject. The impersonate verb allows acting as any user or group in the cluster.',
    why: 'A subject with escalate can self-elevate to cluster-admin: create a ClusterRole with any permissions and bind it to themselves. This completely bypasses the principle of least privilege and is a known Kubernetes privilege escalation path.',
    remediation: [
      'Remove escalate, bind, and impersonate from all non-system ClusterRoles',
      'If these are needed for admission controllers or CI/CD, isolate to a dedicated SA with full audit logging',
      'Monitor these verbs in Kubernetes audit logs: filter for "escalate"/"bind"/"impersonate" verb entries',
    ],
  },
  'CIS 5.1.9': {
    description: 'PersistentVolumes and PersistentVolumeClaims are cluster-scoped. A ClusterRole with wildcard access can read, modify, or delete persistent storage across all namespaces — potentially accessing another application\'s database files.',
    why: 'An attacker with PV wildcard access can rebind PVCs to steal another namespace\'s data, delete PVCs to cause data loss across the cluster, or create new PVs pointing to sensitive host paths.',
    remediation: [
      'Scope PV/PVC access to get, list, watch if only listing is needed',
      'Use resourceNames to restrict access to specific PVCs',
      'Prefer namespace-scoped Roles for PVC management — most workloads only need to manage their own namespace\'s storage',
    ],
  },

  // ── CIS 5.2 Pod Security ──────────────────────────────────────────────────
  'CIS 5.2.1': {
    description: 'The AlwaysPullImages admission plugin forces Kubernetes to always pull container images from the registry, re-verifying the image checksum and registry authentication on every pod start.',
    why: 'Without AlwaysPullImages, a cached image on the node is used without re-authentication. An attacker who can push a malicious image with the same tag as a cached image can hijack scheduled workloads without triggering a new pull.',
    remediation: [
      'Enable on the kube-apiserver: --enable-admission-plugins=...,AlwaysPullImages',
      'Alternatively use image digests (@sha256:...) instead of tags — digest pinning guarantees immutability regardless of this setting',
      'Implement image signing with Cosign/Notary and signature verification in the admission chain (e.g., Kyverno policy)',
    ],
  },
  'CIS 5.2.2': {
    description: 'When hostPID: true is set, the pod shares the node\'s process ID namespace and can see every process running on the node, including those in other containers and the host OS.',
    why: 'An attacker in a hostPID pod can read /proc/<pid>/environ of any process to extract environment variables (including secrets), inject code via ptrace into arbitrary processes, or kill critical system daemons.',
    remediation: [
      'Remove hostPID: true from all pod specs',
      'Enforce Pod Security Standards: kubectl label namespace <ns> pod-security.kubernetes.io/enforce=restricted',
      'For process monitoring, use the Kubernetes metrics API or a DaemonSet agent (Datadog, Prometheus Node Exporter) rather than hostPID',
    ],
  },
  'CIS 5.2.3': {
    description: 'hostIPC: true allows the pod to access the host\'s inter-process communication namespace, including System V shared memory segments and semaphores used by other containers and OS processes.',
    why: 'An attacker can read or write shared memory used by other containers or host processes, extract in-memory secrets from IPC-backed message queues, or corrupt inter-process communication causing service failures.',
    remediation: [
      'Remove hostIPC: true from all pod specs',
      'Shared memory between containers in the same pod can be done with emptyDir volumes — no hostIPC required',
    ],
  },
  'CIS 5.2.4': {
    description: 'hostNetwork: true attaches the pod directly to the node\'s network interface, bypassing all pod network isolation including NetworkPolicy rules and the CNI network namespace.',
    why: 'A hostNetwork pod can listen on any node port, sniff all unencrypted node-level traffic, reach the EC2 metadata endpoint at 169.254.169.254 to steal IMDS credentials, and bypass all NetworkPolicy controls.',
    remediation: [
      'Remove hostNetwork: true from all pod specs',
      'Use a Kubernetes Service to expose ports without host network access',
      'For monitoring workloads that need node metrics, use the Kubernetes metrics API or DaemonSet with a proper Service',
      'If absolutely required (e.g., some CNI DaemonSets), isolate to a dedicated node group with tightly scoped NetworkPolicies',
    ],
  },
  'CIS 5.2.5': {
    description: 'A privileged container runs with all Linux capabilities, can see all host devices, and is not restricted by seccomp or AppArmor profiles. It has virtually root-equivalent access to the host kernel.',
    why: 'A privileged container can mount any host filesystem path, load kernel modules, escape cgroup restrictions, and access block devices — full node compromise requires no additional exploit beyond code execution in the container.',
    remediation: [
      'Set securityContext.privileged: false on all containers',
      'Replace broad privilege with specific capabilities: add only what is actually needed after dropping ALL',
      'Enforce via Pod Security Standards: kubectl label ns <ns> pod-security.kubernetes.io/enforce=restricted',
      'For storage/networking DaemonSets that legitimately need privilege, isolate to system namespaces with restricted access',
    ],
  },
  'CIS 5.2.6': {
    description: 'allowPrivilegeEscalation controls whether a process can gain more privileges than its parent. When not explicitly set to false, binaries with setuid bits inside the container can elevate to root.',
    why: 'An application vulnerability (buffer overflow, command injection) combined with a setuid binary in the image allows escalation to root within the container, greatly increasing ability to pivot, escape, or access host resources.',
    remediation: [
      'Set securityContext.allowPrivilegeEscalation: false on all containers',
      'Combine with runAsNonRoot: true and runAsUser: 1000+ for defense-in-depth',
      'Use distroless or scratch base images — they contain no setuid binaries',
    ],
  },
  'CIS 5.2.7': {
    description: 'Running as root (UID 0) means any file system access, network binding, or exploit has maximum impact. Root inside a container has elevated ability to interact with host resources if other controls are absent.',
    why: 'Container escape exploits are far more impactful when the process runs as root. Root trivially exploits many setuid binaries and can write to system paths, directly compromising the node in combination with other misconfigurations.',
    remediation: [
      'Set securityContext.runAsNonRoot: true and runAsUser: 1000 (or any non-zero UID)',
      'Add USER 1000:1000 to the Dockerfile — set a non-root user at the image layer',
      'Use multi-stage builds to ensure the final image runs as a non-root user',
      'Test image: docker run --rm <image> id — must not return uid=0(root)',
    ],
  },
  'CIS 5.2.8': {
    description: 'Linux capabilities split root privilege into discrete units. Some capabilities (SYS_ADMIN, SYS_MODULE, NET_RAW) are dangerous enough to enable container escapes or node-level attacks on their own.',
    why: 'SYS_ADMIN enables most published container breakout exploits. SYS_MODULE allows loading malicious kernel modules. NET_RAW enables ARP spoofing and raw packet injection for MITM attacks. These are the building blocks of real-world container compromises.',
    remediation: [
      'Set capabilities.drop: ["ALL"] on every container — start with zero capabilities',
      'Add back only the specific capabilities needed: e.g., NET_BIND_SERVICE for port 80',
      'Most web services and APIs need zero extra capabilities after dropping ALL',
      'Run your app with --cap-drop=all locally to discover which caps are actually needed',
    ],
  },
  'CIS 5.2.9': {
    description: 'hostPath volumes mount a directory from the node\'s filesystem into the container. Depending on the path, this can expose kubelet config, container runtime sockets, cloud credential files, or the entire root filesystem.',
    why: 'Mounting /var/run/docker.sock gives container escape via the Docker API. Mounting /etc exposes node credentials and SSH keys. Mounting / grants full host filesystem read/write. These are standard lateral movement techniques in container environments.',
    remediation: [
      'Replace hostPath volumes with emptyDir, ConfigMap, Secret, or PersistentVolumeClaim',
      'If log collection requires hostPath, mount only the specific log directory as readOnly: true',
      'Never mount: /, /etc, /var/run/docker.sock, /var/run/containerd.sock, /proc, or /sys',
      'For DaemonSets with legitimate hostPath needs, restrict the exact sub-path and set readOnly: true where possible',
    ],
  },
  'CIS 5.2.10': {
    description: 'hostPort binds a container port directly to a specific port on the node\'s network interface, bypassing Kubernetes service abstraction and NetworkPolicy enforcement entirely.',
    why: 'hostPort makes the service directly accessible on every cluster node\'s IP at that port, bypassing external firewall rules and NetworkPolicy. It also couples the pod to a specific node, breaking proper scheduling and redundancy.',
    remediation: [
      'Remove hostPort from all container port definitions',
      'Use a Kubernetes Service (ClusterIP + Ingress, NodePort, or LoadBalancer) to expose the workload',
      'hostPort should only exist in system-level DaemonSets where direct node port access is architecturally required',
    ],
  },
  'CIS 5.2.11': {
    description: 'AppArmor profiles restrict which system calls and filesystem paths a container process can access, providing a mandatory access control layer against container escapes.',
    why: 'Without an AppArmor profile, a compromised container can make any syscall the kernel allows. A runtime/default AppArmor profile blocks write access to sensitive paths and restricts dangerous syscalls, stopping many known exploit techniques.',
    remediation: [
      'Apply runtime/default profile via annotation: container.apparmor.security.beta.kubernetes.io/<container>: runtime/default',
      'In Kubernetes 1.30+ use the securityContext.appArmorProfile field directly',
      'For sensitive workloads, generate custom profiles with bane or aa-genprof',
      'Note: AppArmor must be installed and enabled on the node OS (default on Ubuntu/Debian)',
    ],
  },
  'CIS 5.2.12': {
    description: 'seccomp (secure computing mode) restricts which Linux system calls a container can make. Without a seccomp profile, containers run Unconfined — every syscall to the host kernel is permitted.',
    why: 'Many container escape exploits rely on obscure or dangerous syscalls. RuntimeDefault seccomp blocks ~300 rarely-needed syscalls, significantly reducing the kernel attack surface available to an attacker who has achieved code execution.',
    remediation: [
      'Set spec.securityContext.seccompProfile.type: RuntimeDefault to apply the container runtime\'s default profile',
      'Do not use Unconfined — this disables all seccomp filtering and is equivalent to no profile',
      'For sensitive workloads, create a Localhost profile that allows only the specific syscalls your app uses',
      'Test with strace to identify required syscalls before creating a custom profile',
    ],
  },
  'CIS 5.2.13': {
    description: 'A writable root filesystem allows an attacker who has gained code execution to modify application binaries, install malware, add cron jobs, or write persistence mechanisms.',
    why: 'Writing to the root filesystem lets an attacker backdoor application binaries, modify /etc/hosts for SSRF, install credential-harvesting tools, or create persistence that survives pod restarts if image caching is used.',
    remediation: [
      'Set securityContext.readOnlyRootFilesystem: true on all containers',
      'Mount writable paths explicitly as emptyDir volumes: /tmp, /var/cache, application write directories',
      'Run with --read-only flag locally to discover all paths that need write access, then mount them as volumes',
      'A truly stateless container should need write access to zero paths in the root filesystem',
    ],
  },

  // ── CIS 5.3 Network ───────────────────────────────────────────────────────
  'CIS 5.3.1': {
    description: 'Not all Kubernetes CNI plugins implement NetworkPolicy enforcement. If the CNI plugin ignores NetworkPolicy objects, policies exist in etcd but have no effect, creating a dangerous false sense of security.',
    why: 'A cluster operator who thinks namespaces are policy-isolated when the CNI doesn\'t enforce policies has unrestricted pod-to-pod connectivity. An attacker can move laterally across the entire cluster unimpeded.',
    remediation: [
      'Use a NetworkPolicy-capable CNI: Calico, Cilium, Antrea, or Weave Net',
      'On AWS EKS: use Amazon VPC CNI with Network Policy support (EKS 1.29+) or install Calico as a separate addon',
      'Verify enforcement: create a deny-all policy and test that traffic is actually blocked',
      'Cilium also provides NetworkPolicy visualization — useful for ongoing verification',
    ],
  },
  'CIS 5.3.2': {
    description: 'Without NetworkPolicies, all pods in all namespaces can communicate freely. A single compromised pod can reach the Kubernetes API server, cloud metadata service, databases, and every other pod in the cluster.',
    why: 'Lateral movement is trivial without NetworkPolicy. A compromised frontend pod can directly connect to database pods, etcd, the kube-apiserver ClusterIP, or the EC2 metadata endpoint at 169.254.169.254 to steal instance credentials.',
    remediation: [
      'Start with a default-deny-all ingress+egress policy in every workload namespace',
      'Add explicit allow rules for each legitimate traffic path (e.g., frontend → backend on port 8080)',
      'Allow DNS egress explicitly: port 53 UDP/TCP to the kube-dns ClusterIP',
      'kubectl apply -f - <<EOF\napiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: default-deny\nspec:\n  podSelector: {}\n  policyTypes: [Ingress, Egress]\nEOF',
    ],
  },

  // ── CIS 5.4 Secrets ───────────────────────────────────────────────────────
  'CIS 5.4.1': {
    description: 'Secrets mounted as environment variables are visible in /proc/<pid>/environ, included in crash dumps, captured by many logging frameworks that dump env vars on startup, and exposed via container runtime inspection tools.',
    why: 'crictl inspect and docker inspect show all environment variables including secrets. Log aggregation systems frequently capture env dumps. An attacker with /proc access can extract all env-var credentials without any special privileges.',
    remediation: [
      'Mount secrets as files using volumes.secret and volumeMounts instead of env vars',
      'The secret value is then available as a file readable only by the process, not visible in /proc/environ',
      'For AWS credentials, use IRSA — no secret needed in the pod at all',
      'If env vars are unavoidable, at minimum use secretKeyRef to avoid hardcoding in the manifest',
    ],
  },
  'CIS 5.4.2': {
    description: 'Storing credentials in Kubernetes Secrets means they live in etcd, often without encryption at rest. External secret managers provide encryption, rotation, audit logging, and fine-grained access control that etcd cannot match.',
    why: 'Without encryption at rest, anyone with access to etcd backups (S3 bucket, disk snapshot) can read all Secrets in plaintext. External secret stores add defense-in-depth and enable automatic rotation.',
    remediation: [
      'Use AWS Secrets Manager with External Secrets Operator (ESO) or Secrets Store CSI Driver',
      'Enable encryption at rest via EncryptionConfiguration on the kube-apiserver',
      'Use IRSA to give workloads direct access to AWS Secrets Manager — no credentials stored in K8s at all',
      'Implement secret rotation — ESO can automatically sync rotated secrets to Kubernetes Secrets',
    ],
  },

  // ── MITRE ATT&CK ─────────────────────────────────────────────────────────
  'T1610': {
    description: 'Adversaries may deploy a container into an environment to facilitate execution or evade defenses. In Kubernetes, this means creating a new pod — potentially privileged — to run attacker-controlled code.',
    why: 'A subject with pod create permissions can launch a container that mounts the host filesystem, runs in privileged mode, or executes arbitrary commands, bypassing all application-level controls.',
    remediation: [
      'Restrict who can create pods with RBAC — most service accounts should not have this permission',
      'Enforce Pod Security Standards (restricted profile) to reject privileged pods even if RBAC allows creation',
      'Use OPA Gatekeeper or Kyverno to enforce image allowlists and restrict container configurations',
    ],
  },
  'T1609': {
    description: 'Adversaries may abuse kubectl exec and kubectl attach to achieve execution inside running containers, harvest environment variables, and move laterally within the cluster.',
    why: 'kubectl exec gives a direct interactive shell inside any pod the user has RBAC access to. This allows environment variable extraction, credential harvesting, network pivoting, and deployment of persistence mechanisms — all without deploying new containers.',
    remediation: [
      'Remove pods/exec and pods/attach verbs from all non-operator ClusterRoles',
      'Implement a break-glass procedure for legitimate debugging with time-limited ephemeral permissions',
      'Use kubectl debug with ephemeral containers instead — more auditable and controllable',
      'Alert on any exec/attach events via Kubernetes audit policy',
    ],
  },
  'T1059': {
    description: 'Adversaries may use scripting or command interpreter capabilities already present in containers (bash, python, curl) to execute malicious code after initial access.',
    why: 'Most container images ship with shells and interpreters. An attacker who achieves code execution (via RCE, SSRF, deserialization) can immediately run arbitrary commands using the container\'s built-in tools.',
    remediation: [
      'Use distroless or scratch images — no shell, no package manager, minimal attack surface',
      'Deploy runtime threat detection (Falco) to alert on anomalous process spawns inside containers',
      'Enforce seccomp and AppArmor profiles to restrict available syscalls and filesystem access',
      'NOTE: GuardMap cannot detect this statically — runtime monitoring is required',
    ],
  },
  'T1525': {
    description: 'Adversaries may implant malicious code inside container images to establish persistence or provide a backdoor. Using unpinned tags allows a malicious image to be injected by overwriting the tag in the registry.',
    why: 'An attacker who compromises a container registry account or a supply chain pipeline can push a malicious image with the same tag. Workloads pulling by tag will silently receive the compromised image on the next restart.',
    remediation: [
      'Pin all images to immutable digests: image: nginx@sha256:abc123... instead of nginx:latest',
      'Use a private registry (ECR) with push protection and image scanning (Trivy, Snyk)',
      'Implement image signing (Cosign) and verify signatures in the admission chain',
      'Enable ECR image scanning on push and alert on critical/high CVEs before deploying',
    ],
  },
  'T1136': {
    description: 'Adversaries may create new Kubernetes service accounts, cluster roles, or user credentials to maintain persistent access to the cluster even after the initial compromise vector is closed.',
    why: 'Creating a new ClusterRoleBinding that grants cluster-admin to a new SA is a trivial persistence mechanism. The legitimate team may clean up the original compromise but miss the backdoor account.',
    remediation: [
      'Enable Kubernetes audit logging and alert on unexpected ClusterRoleBinding creations',
      'Use admission webhooks (Kyverno/OPA) to require approval for new ClusterRoleBindings',
      'Regularly reconcile RBAC state against a known-good baseline in git (GitOps)',
      'NOTE: GuardMap cannot detect this statically — audit log monitoring is required',
    ],
  },
  'T1611': {
    description: 'Adversaries may exploit weaknesses in container security configurations to escape the container and gain access to the underlying host OS, from which they can pivot to the entire cluster.',
    why: 'A container with hostPID, hostNetwork, privileged mode, or hostPath mounts is trivially escaped. Node access means access to all pod credentials, the kubelet API, other pods\' data, and cloud instance metadata.',
    remediation: [
      'Eliminate all privileged containers, hostPID, hostIPC, hostNetwork, and sensitive hostPath mounts',
      'Enforce Pod Security Standards at the restricted level cluster-wide',
      'Use gVisor or Kata Containers for workloads that require stronger isolation (e.g., multi-tenant)',
    ],
  },
  'T1548': {
    description: 'Adversaries may abuse mechanisms that allow processes to gain higher-level permissions, such as setuid binaries inside containers or missing allowPrivilegeEscalation controls.',
    why: 'A container running as non-root with allowPrivilegeEscalation unset can execute a setuid binary to become root inside the container, significantly increasing the blast radius of any subsequent exploit.',
    remediation: [
      'Set allowPrivilegeEscalation: false and runAsNonRoot: true on all containers',
      'Use distroless images that contain no setuid binaries',
      'Drop all Linux capabilities and add back only what is specifically needed',
    ],
  },
  'T1068': {
    description: 'Adversaries may exploit software vulnerabilities or misconfigurations — including RBAC misconfigurations — to elevate privileges from a low-privileged position to cluster-admin.',
    why: 'RBAC escalation paths (escalate verb, wildcard roles, cluster-admin bindings) allow a compromised service account to self-elevate to full cluster control without exploiting any software vulnerability.',
    remediation: [
      'Audit all ClusterRoles for wildcard permissions, escalate/bind/impersonate verbs, and cluster-admin bindings',
      'Enforce principle of least privilege — service accounts should have only the exact permissions their workload requires',
      'Use tools like rakkess or kubectl-who-can to visualize effective permissions',
    ],
  },
  'T1562': {
    description: 'Adversaries may attempt to disable or modify audit logging to evade detection and cover their tracks after an initial compromise.',
    why: 'Without audit logging, there is no record of API calls made by a compromised service account — secret reads, pod creations, RBAC changes. An attacker who can modify the kube-apiserver config can disable audit entirely.',
    remediation: [
      'Enable comprehensive Kubernetes audit logging on the kube-apiserver',
      'Forward audit logs to an immutable, out-of-cluster log store (CloudWatch, S3 with Object Lock)',
      'Alert on any modification to the kube-apiserver configuration or audit policy',
      'NOTE: GuardMap cannot detect this statically — audit log configuration review required',
    ],
  },
  'T1599': {
    description: 'Adversaries may bridge across network segmentation boundaries by exploiting missing or overly permissive NetworkPolicies, reaching systems outside the intended communication scope.',
    why: 'Without NetworkPolicy, a compromised pod can reach cloud provider metadata APIs, internal databases, etcd, the Kubernetes API server, and other microservices — enabling broad lateral movement from any container.',
    remediation: [
      'Implement default-deny NetworkPolicies in all workload namespaces',
      'Explicitly block access to 169.254.169.254 (IMDS) unless the workload uses IMDS directly',
      'Use Cilium or Calico for DNS-based egress policy enforcement',
    ],
  },
  'T1552': {
    description: 'Adversaries search for unsecured credentials — secrets stored as environment variables, mounted SA tokens, or plaintext values in ConfigMaps — to facilitate access to additional systems.',
    why: 'Credentials in environment variables are visible to any process in the container and appear in crash dumps, log output, and runtime inspection. Mounted SA tokens give Kubernetes API access from any compromised container.',
    remediation: [
      'Replace env var secrets with file-mounted Secrets or external secret managers',
      'Disable SA token automounting for workloads that do not need Kubernetes API access',
      'Use IRSA for AWS access — eliminates the need for AWS credentials as Kubernetes Secrets',
      'Scan application logs for accidental credential exposure using tools like truffleHog or gitleaks',
    ],
  },
  'T1528': {
    description: 'Adversaries may steal application access tokens (OAuth tokens, JWT tokens, API keys) from running containers to authenticate to external services as the compromised application.',
    why: 'Application tokens stored in memory, env vars, or mounted files can be exfiltrated from a compromised container and replayed against external APIs — bypassing IP restrictions since they appear as legitimate application requests.',
    remediation: [
      'Use short-lived, rotatable tokens wherever possible (OAuth PKCE, IRSA, Workload Identity)',
      'Detect anomalous token usage via AWS CloudTrail / API Gateway logs',
      'NOTE: GuardMap cannot detect runtime credential theft — SIEM/UEBA monitoring required',
    ],
  },
  'T1613': {
    description: 'Adversaries may attempt to discover available containers, images, and cluster resources — including node metadata — to inform subsequent lateral movement and privilege escalation.',
    why: 'Access to the nodes API reveals node names, IPs, instance types, labels, and taints. This enables targeted attacks against specific nodes (e.g., nodes with privileged DaemonSets) and assists in planning escape techniques.',
    remediation: [
      'Remove nodes resource access from non-system ClusterRoles',
      'Service accounts should never need to list/get nodes unless they are cluster infrastructure components',
      'Use RBAC audit tools to find unexpected node access: kubectl-who-can get nodes',
    ],
  },
  'T1190': {
    description: 'Adversaries may attempt to exploit vulnerabilities in internet-facing applications running in Kubernetes to gain initial access to the cluster or its underlying infrastructure.',
    why: 'A vulnerability in a public-facing application gives code execution inside the container. From there, the attacker leverages Kubernetes misconfigurations (over-privileged SA, missing NetworkPolicy) for lateral movement.',
    remediation: [
      'Keep container images patched and scan for CVEs with Trivy or Snyk on every build',
      'Expose only necessary ports via Ingress — avoid LoadBalancer/NodePort for internal services',
      'Use Web Application Firewall (AWS WAF) in front of public-facing Ingress',
      'NOTE: GuardMap cannot detect application vulnerabilities — DAST/SAST tooling required',
    ],
  },
  'T1078': {
    description: 'Adversaries may obtain and abuse valid IAM credentials (via IRSA, leaked keys, or over-permissive roles) to authenticate to AWS services and access cloud resources.',
    why: 'A pod with a wildcard IAM role can access any AWS service in the account. If the role is shared between environments, a dev/staging compromise pivots directly to production AWS resources.',
    remediation: [
      'Scope IAM roles to minimum required AWS actions and specific resource ARNs',
      'Use IAM Access Analyzer to identify over-permissive policies and trust relationships',
      'Never share IAM roles between production and non-production Kubernetes namespaces',
      'Enable CloudTrail and alert on anomalous API call patterns from EKS workload identities',
    ],
  },
  'T1530': {
    description: 'Adversaries may access S3 buckets, DynamoDB tables, and other cloud storage services using credentials obtained from compromised workloads that have over-permissive IAM roles.',
    why: 'An IAM role with s3:GetObject on * means any pod using that role can download any object from any bucket in the account. Combined with a container escape, this enables complete data exfiltration.',
    remediation: [
      'Scope IAM policies to specific S3 bucket ARNs and key prefixes: arn:aws:s3:::my-bucket/data/*',
      'Enable S3 Block Public Access at the account level',
      'Use S3 bucket policies with aws:PrincipalOrgID conditions to restrict cross-account access',
      'Monitor S3 data access with Macie and CloudTrail data events',
    ],
  },
  'T1499': {
    description: 'Adversaries may perform denial of service attacks by exhausting container resources — CPU, memory, disk — to degrade or halt service availability.',
    why: 'Containers without resource limits can consume all CPU and memory on a node, causing OOM kills of other containers and node NotReady conditions. CronJobs without concurrency controls can spawn thousands of pods simultaneously.',
    remediation: [
      'Set resources.limits.cpu and resources.limits.memory on every container',
      'Set resources.requests to inform the scheduler and enable proper bin-packing',
      'Set CronJob concurrencyPolicy: Forbid or Replace to prevent pile-up',
      'Configure LimitRange objects to enforce resource limits at the namespace level',
    ],
  },

  // ── NSA/CISA ──────────────────────────────────────────────────────────────
  'NSA-PS-1': {
    description: 'NSA/CISA recommends running all containers as non-root with limited capabilities to reduce the blast radius of container compromises.',
    why: 'Root processes with full capabilities represent maximum risk if compromised. Non-root processes with minimal capabilities significantly limit what an attacker can do after gaining code execution.',
    remediation: [
      'Set runAsNonRoot: true, runAsUser: 1000+, allowPrivilegeEscalation: false on all containers',
      'Set capabilities.drop: [ALL] and add back only what is needed',
      'Apply Pod Security Standards at the restricted level for all workload namespaces',
    ],
  },
  'NSA-PS-2': {
    description: 'Containers should use read-only root filesystems to prevent runtime modification of application code or system files.',
    why: 'A writable filesystem enables persistence mechanisms, binary tampering, and toolchain installation that survive container restarts, greatly expanding post-exploitation capabilities.',
    remediation: [
      'Set securityContext.readOnlyRootFilesystem: true',
      'Mount writable paths as emptyDir volumes explicitly',
    ],
  },
  'NSA-PS-3': {
    description: 'Every container should declare CPU and memory resource requests and limits to prevent resource starvation attacks and ensure predictable scheduling.',
    why: 'Containers without limits can starve other workloads on the same node, cause cascading OOM kills, and be exploited for denial-of-service. Requests are required for the Kubernetes scheduler to make optimal placement decisions.',
    remediation: [
      'Set resources.requests and resources.limits on every container',
      'Use LimitRange objects to enforce defaults at the namespace level',
      'Use ResourceQuota to cap total resource consumption per namespace',
    ],
  },
  'NSA-NP-1': {
    description: 'NSA/CISA recommends using NetworkPolicies to implement a zero-trust network model, restricting pod-to-pod communication to only what is explicitly required.',
    why: 'Flat cluster networking enables unlimited lateral movement. A single compromised pod in an unrestricted cluster can scan and reach every other service, database, and infrastructure endpoint.',
    remediation: [
      'Apply default-deny-all policies to all workload namespaces',
      'Add explicit ingress/egress allow rules per service',
      'Use Cilium or Calico for advanced policy features (DNS-based policies, L7 policies)',
    ],
  },
  'NSA-NP-2': {
    description: 'NSA/CISA advises minimizing external network exposure by avoiding NodePort and public LoadBalancer services unless explicitly required.',
    why: 'NodePort services are accessible on all cluster node IPs and bypass external load balancer security controls. Public LoadBalancer services may provision unintended internet-accessible IP addresses.',
    remediation: [
      'Use ClusterIP + Ingress controller for HTTP/HTTPS services',
      'For internal LoadBalancers add annotation: service.beta.kubernetes.io/aws-load-balancer-internal: "true"',
      'Apply Security Groups / firewall rules to restrict NodePort and LoadBalancer access to known CIDRs',
    ],
  },
  'NSA-AUTH-1': {
    description: 'NSA/CISA recommends applying the principle of least privilege to all RBAC roles and service accounts, ensuring each workload has only the permissions it needs.',
    why: 'Over-privileged service accounts are the primary lateral movement mechanism in Kubernetes cluster compromises. A single compromised pod with broad RBAC permissions can compromise the entire cluster.',
    remediation: [
      'Audit existing RBAC: kubectl get clusterroles,roles -A -o yaml | grep -A5 "rules:"',
      'Use separate ServiceAccounts per workload with exactly the permissions needed',
      'Remove unused RoleBindings and ClusterRoleBindings regularly',
    ],
  },
  'NSA-SEC-1': {
    description: 'NSA/CISA recommends storing secrets as file mounts rather than environment variables to reduce the exposure surface of sensitive credentials.',
    why: 'Environment variables are visible in process lists, container inspection output, crash dumps, and many logging frameworks. File-mounted secrets are accessible only to the process that reads them.',
    remediation: [
      'Convert all secretKeyRef env vars to volumeMount + secretVolumeSource',
      'Use IRSA to eliminate the need for AWS credential secrets entirely',
      'For plaintext credentials in env vars, migrate to Kubernetes Secrets + file mount',
    ],
  },
  'NSA-IMG-1': {
    description: 'NSA/CISA advises using container images from trusted, private registries with vulnerability scanning to prevent supply chain attacks.',
    why: 'Public registries provide no guarantees about image provenance or security. A malicious image can contain backdoors, miners, or credential stealers that activate at container start.',
    remediation: [
      'Mirror all required base images to a private ECR registry',
      'Scan images in CI with Trivy before pushing: trivy image --exit-code 1 --severity CRITICAL <image>',
      'Use image digests instead of tags for immutable references',
      'Implement an ImagePolicyWebhook to block images from unapproved registries at admission time',
    ],
  },
  'NSA-NS-1': {
    description: 'NSA/CISA recommends using Kubernetes namespaces to create logical isolation boundaries between workloads, enabling targeted NetworkPolicy, RBAC, and ResourceQuota enforcement.',
    why: 'The default namespace has no NetworkPolicy, ResourceQuota, or dedicated RBAC by default. Workloads deployed there share an undifferentiated security posture and cannot be individually scoped with policies.',
    remediation: [
      'Create dedicated namespaces per application team or service: kubectl create namespace <app>',
      'Apply default-deny NetworkPolicy, ResourceQuota, and LimitRange to every new namespace',
      'Use Namespace labels for Pod Security Standards enforcement',
    ],
  },
  'NSA-CJ-1': {
    description: 'NSA/CISA recommends configuring CronJob concurrency policies and deadlines to prevent resource exhaustion from runaway scheduled jobs.',
    why: 'A CronJob with Allow concurrency and no startingDeadlineSeconds can accumulate hundreds of running pods if a long-running job overlaps with the next scheduled execution, exhausting node resources.',
    remediation: [
      'Set concurrencyPolicy: Forbid or Replace on all CronJobs',
      'Set startingDeadlineSeconds to limit how late a missed job can start (e.g., 300 seconds)',
      'Set ttlSecondsAfterFinished on Job templates to clean up completed Jobs automatically',
    ],
  },
  'NSA-LOG-1': {
    description: 'NSA/CISA requires enabling Kubernetes audit logging and forwarding logs to an immutable, out-of-cluster store for threat detection and forensic investigation.',
    why: 'Without audit logging there is no record of API calls — secret reads, RBAC changes, pod creations — made during a compromise. Attackers routinely exploit the absence of audit logs to operate undetected.',
    remediation: [
      'Enable audit logging on the kube-apiserver with a policy that captures metadata for all requests and request bodies for sensitive resources (secrets, configmaps)',
      'Forward audit logs to CloudWatch Logs or an S3 bucket with Object Lock enabled',
      'Set up alerts for: secret list/watch, ClusterRoleBinding creates, exec/attach calls',
      'NOTE: GuardMap cannot detect audit log configuration — requires kube-apiserver config inspection',
    ],
  },
  'NSA-UPD-1': {
    description: 'NSA/CISA recommends keeping Kubernetes components and container images up to date to minimize exposure to known vulnerabilities.',
    why: 'Outdated images with known CVEs are a primary initial access vector. Container runtime vulnerabilities (runc, containerd) can enable node-level exploits. Kubernetes itself has had critical privilege escalation CVEs.',
    remediation: [
      'Pin images to specific digests and update them on a regular schedule via renovate or dependabot',
      'Scan images in CI: trivy image --exit-code 1 --severity CRITICAL,HIGH <image>',
      'Keep Kubernetes version within the N-2 supported versions',
      'Subscribe to kubernetes-security-announce@googlegroups.com for CVE notifications',
    ],
  },

  // ── AWS EKS BP ────────────────────────────────────────────────────────────
  'EKS-IRSA-1': {
    description: 'AWS recommends scoping IRSA IAM roles to the minimum required actions and specific resource ARNs, following the principle of least privilege for cloud service access.',
    why: 'An over-permissive IAM role means a single compromised pod can access any AWS service action across all resources in the account — effectively an AWS root key exposure from a K8s container escape.',
    remediation: [
      'Replace Action: "*" and Resource: "*" with specific actions and ARNs',
      'Use IAM Access Analyzer to generate least-privilege policies from CloudTrail activity',
      'Add condition keys: StringEquals aws:RequestedRegion: us-east-1 to restrict by region',
      'Enable IAM credential reports and review unused permissions quarterly',
    ],
  },
  'EKS-IRSA-2': {
    description: 'AWS recommends creating separate IAM roles for each environment. Sharing IAM roles between production and non-production Kubernetes namespaces creates cross-environment blast radius.',
    why: 'A developer mistake or supply chain compromise in a staging namespace that shares an IAM role with production can directly read, modify, or delete production AWS resources — bypassing all environment separation controls.',
    remediation: [
      'Create separate IAM roles per environment: role-payments-prod, role-payments-staging',
      'Use IRSA trust policy conditions to enforce namespace isolation: StringEquals eks.amazonaws.com/namespace: production',
      'Use IAM resource tags and SCPs to enforce environment boundaries at the policy level',
    ],
  },
  'EKS-IRSA-3': {
    description: 'When using IRSA for AWS credentials, disabling Kubernetes SA token automounting eliminates unnecessary credential exposure inside the pod.',
    why: 'A pod with IRSA already has AWS credentials via the projected service account token. Having a second Kubernetes SA token mounted means both AWS and Kubernetes API credentials are exposed simultaneously, doubling the credential surface for an attacker.',
    remediation: [
      'Set automountServiceAccountToken: false on all pods that use IRSA-annotated service accounts',
      'The IRSA projected token is injected separately by the EKS Pod Identity webhook — it does not require the legacy automount mechanism',
    ],
  },
  'EKS-IRSA-4': {
    description: 'ServiceAccounts with IRSA annotations that are not used by any running pod maintain an active IAM trust relationship unnecessarily.',
    why: 'An orphaned IRSA annotation keeps the IAM trust policy open. If the ServiceAccount is later bound to a new pod by mistake or by an attacker, it immediately gets production IAM credentials without any additional configuration.',
    remediation: [
      'Remove the eks.amazonaws.com/role-arn annotation from ServiceAccounts not used by any pod',
      'Also review the IAM role\'s trust policy and remove the unused Kubernetes condition',
      'Automate this check: compare SA IRSA annotations against running pod service account usage',
    ],
  },
  'EKS-RBAC-1': {
    description: 'AWS recommends preferring namespace-scoped Roles and RoleBindings over cluster-scoped ClusterRoles wherever possible to limit the blast radius of a compromised service account.',
    why: 'A ClusterRoleBinding gives the subject access to that role\'s permissions in every namespace present and future. A RoleBinding scopes the same permissions to a single namespace, limiting lateral movement.',
    remediation: [
      'Audit ClusterRoleBindings and determine which can be converted to namespace-scoped RoleBindings',
      'Use Role + RoleBinding for workloads that only need access within their own namespace',
      'Keep ClusterRoleBindings only for genuine cluster-wide operators (CNI, autoscaler, monitoring agents)',
    ],
  },
  'EKS-NET-1': {
    description: 'AWS recommends combining Security Groups for Pods with Kubernetes NetworkPolicies for layered network access control in EKS clusters.',
    why: 'NetworkPolicy alone operates at L3/L4 within the cluster. Security Groups for Pods extend controls to the AWS VPC level, enabling restrictions on which VPC resources (RDS, ElastiCache) specific pods can reach.',
    remediation: [
      'Enable Security Groups for Pods on EKS (requires VPC CNI plugin)',
      'Apply default-deny NetworkPolicies to all workload namespaces',
      'Use Cilium or VPC CNI network policies for intra-cluster traffic control',
    ],
  },
  'EKS-IMG-1': {
    description: 'AWS recommends using private ECR repositories with image scanning enabled to ensure only vetted, vulnerability-free images run in EKS clusters.',
    why: 'Public registry images have no provenance guarantees and may contain known CVEs or malicious layers. ECR with scanning provides a gated, private supply chain with automated vulnerability detection.',
    remediation: [
      'Create private ECR repositories and mirror required base images',
      'Enable ECR Enhanced Scanning (Inspector-based) on all repositories',
      'Use ECR Lifecycle Policies to remove old/untagged images automatically',
      'Block public registry access with an ImagePolicyWebhook or Kyverno policy',
    ],
  },

  // ── OWASP K10 ─────────────────────────────────────────────────────────────
  'K01': {
    description: 'Insecure workload configurations — privileged containers, root processes, host namespace sharing — represent the most common and impactful Kubernetes security failures.',
    why: 'Misconfigured pod specs are the primary escalation path after initial code execution. A single privileged container or hostPID pod can compromise the entire underlying node and every other workload on it.',
    remediation: [
      'Enforce Pod Security Standards (restricted profile) at the namespace level',
      'Implement security context defaults: non-root, no privilege escalation, read-only FS, drop all caps',
      'Use OPA Gatekeeper or Kyverno to enforce workload security policies at admission time',
    ],
  },
  'K02': {
    description: 'Supply chain vulnerabilities arise from using untrusted, unpinned, or unscanned container images that may contain malicious code, backdoors, or known CVEs.',
    why: 'Compromised images are a primary vector for cluster-wide compromise. An attacker who controls an image can establish persistence, exfiltrate credentials, and move laterally across all pods using that image.',
    remediation: [
      'Pin images to immutable digests: image: nginx@sha256:...',
      'Scan all images in CI with Trivy before deployment',
      'Use only images from private registries with push protection enabled',
      'Implement image signing and signature verification in the admission chain',
    ],
  },
  'K03': {
    description: 'Overly permissive RBAC configurations — wildcard roles, cluster-admin bindings, escalation verbs — allow compromised service accounts to gain full cluster control.',
    why: 'RBAC misconfiguration is the most common path from container compromise to cluster compromise. A single pod with a wildcard ClusterRole can read all secrets, create privileged pods, and escalate to cluster-admin.',
    remediation: [
      'Audit all ClusterRoles for wildcard permissions and sensitive resource access',
      'Replace cluster-admin with scoped roles for all non-emergency subjects',
      'Use dedicated ServiceAccounts per workload with minimum required permissions',
      'Implement GitOps for RBAC — all changes via PR with mandatory review',
    ],
  },
  'K04': {
    description: 'Without centralized policy enforcement (admission controllers), individual workload configurations drift from security baselines, and developers can deploy insecure configurations without review.',
    why: 'Manual review of every workload configuration is not scalable. Without automated policy enforcement, one misconfigured deployment in any namespace creates an attack surface that may exist for months before being detected.',
    remediation: [
      'Deploy OPA Gatekeeper or Kyverno with policies for all CIS 5.2.x controls',
      'Enable Pod Security Standards as a first layer: kubectl label namespace <ns> pod-security.kubernetes.io/enforce=restricted',
      'Use Conftest in CI pipelines to validate Kubernetes manifests before deployment',
      'NOTE: GuardMap cannot detect absence of admission controllers — requires cluster configuration audit',
    ],
  },
  'K05': {
    description: 'Inadequate logging and monitoring means attacks go undetected, forensic investigation is impossible, and compliance requirements cannot be demonstrated.',
    why: 'Without Kubernetes audit logs, there is no record of which service account read which secret, which user created a privileged pod, or which IP ran kubectl exec — making it impossible to detect or investigate a compromise.',
    remediation: [
      'Enable comprehensive Kubernetes audit logging at the kube-apiserver',
      'Forward logs to CloudWatch Logs, Splunk, or Datadog with long-term retention',
      'Deploy Falco for runtime threat detection (anomalous syscalls, unexpected process spawns)',
      'NOTE: GuardMap cannot detect logging gaps — requires control plane configuration review',
    ],
  },
  'K06': {
    description: 'Broken authentication mechanisms — unnecessary SA token mounting, weak IRSA configurations, default SA usage — expose Kubernetes and AWS API credentials to any process in the container.',
    why: 'An auto-mounted SA token gives every pod a valid Kubernetes API credential. Combined with over-privileged RBAC, this means compromising any container grants API access to the cluster.',
    remediation: [
      'Disable SA token automounting for all workloads that do not call the Kubernetes API',
      'Create dedicated ServiceAccounts per workload rather than using default',
      'Use IRSA for AWS access — workloads never need to handle AWS credentials directly',
    ],
  },
  'K07': {
    description: 'Missing network segmentation controls allow unrestricted pod-to-pod communication, enabling lateral movement across the entire cluster from any single compromised container.',
    why: 'Without NetworkPolicy, a compromised frontend pod can directly reach database pods, the Kubernetes API server, the EC2 metadata endpoint, and any other internal service — no additional exploit required.',
    remediation: [
      'Implement default-deny-all NetworkPolicies in all workload namespaces',
      'Use Cilium for DNS-based egress policies to restrict outbound traffic to specific domains',
      'Block access to 169.254.169.254 (IMDS) for all pods that do not use instance metadata',
    ],
  },
  'K08': {
    description: 'Secrets management failures — storing credentials as environment variables, plaintext ConfigMaps, or unencrypted Kubernetes Secrets — expose sensitive data to compromise via multiple paths.',
    why: 'Environment variable credentials are visible to all processes, appear in crash dumps, and are captured by logging frameworks. Plaintext K8s Secrets in etcd are readable by anyone with etcd backup access.',
    remediation: [
      'Mount secrets as files instead of environment variables',
      'Use AWS Secrets Manager with IRSA for direct, credential-less secret access',
      'Enable encryption at rest for Kubernetes Secrets in etcd',
      'Scan git history and manifests for committed credentials with gitleaks or truffleHog',
    ],
  },
  'K09': {
    description: 'Misconfigured cluster components — insecure RBAC, missing admission webhooks, publicly exposed control plane endpoints — create systemic vulnerabilities that affect every workload in the cluster.',
    why: 'Control plane misconfigurations like system:masters bindings or wildcard ClusterRoles represent cluster-wide compromise paths. A single misconfigured component can undermine all other security controls.',
    remediation: [
      'Follow CIS Kubernetes Benchmark for control plane hardening',
      'Restrict API server access to known CIDRs using EKS API endpoint private access mode',
      'Enable AWS CloudTrail for all EKS API operations',
    ],
  },
  'K10': {
    description: 'Outdated and vulnerable components — container images with known CVEs, outdated Kubernetes versions, unpatched node OS — provide attackers with known exploitation paths.',
    why: 'Known CVEs in container images and Kubernetes components are frequently exploited in the wild. Outdated runc/containerd versions have had critical container escape vulnerabilities (CVE-2019-5736, CVE-2021-30465).',
    remediation: [
      'Pin images to digests and update them on a regular automated schedule (Renovate/Dependabot)',
      'Scan images in CI: trivy image --exit-code 1 --severity CRITICAL <image>',
      'Keep Kubernetes version within the supported N-2 window',
      'Enable automatic security patches on EKS managed node groups',
    ],
  },
}
