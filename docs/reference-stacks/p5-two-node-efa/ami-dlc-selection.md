# Choosing an accelerated AMI and DLC

There is no one-to-one AMI-to-DLC recommendation table. Select each artifact
from its own requirements, validate their compatibility boundary, and then pin
both.

## Host OS and container OS are independent

An EKS node running the AL2023 NVIDIA AMI can run an Ubuntu-based DLC. The
container shares the host kernel and NVIDIA driver, but supplies its own Linux
user space, Python, CUDA runtime, framework, NCCL, libfabric, and related
libraries. The host and container distributions therefore do not need to
match.

AWS publishes separate DLC image tags for the available operating-system
bases. For example, the catalog currently includes both AL2023 PyTorch images
such as `pytorch:2.12.1-cu130-amzn2023` and Ubuntu training images such as
`pytorch-training:2.10.0-gpu-py313-cu130-ubuntu22.04-ec2`. This is an image
selection, not a runtime switch: a particular framework/version may be
published on only one OS base.

## 1. Select the AMI from the infrastructure

Start with:

- EKS/Kubernetes version.
- CPU architecture.
- EC2 accelerator family.
- Required host capabilities such as Fabric Manager and EFA.

For an x86 P5 node, retrieve the current recommended EKS-optimized AL2023
NVIDIA AMI for the cluster version:

```bash
aws ssm get-parameter \
  --name /aws/service/eks/optimized-ami/<kubernetes-version>/amazon-linux-2023/x86_64/nvidia/recommended/image_id \
  --region <region> \
  --query 'Parameter.Value' \
  --output text
```

The accelerated AMI owns the kernel, NVIDIA driver, matching Fabric Manager,
container toolkit, EFA kernel module, and host RDMA layer. EFA and GPU device
plugins remain Kubernetes add-ons.

## 2. Select the DLC from the workload

Choose:

1. Training or inference.
2. Framework and framework version.
3. Python version.
4. GPU and CUDA runtime.
5. Available container OS base for that framework/version.
6. EC2/EKS support and, for distributed training, the EFA/libfabric and NCCL
   OFI stack.

Use the [AWS DLC image catalog](https://aws.github.io/deep-learning-containers/reference/available_images/)
and deploy a digest after validation.

## 3. Validate the boundary

| Boundary | Requirement |
| --- | --- |
| NVIDIA driver to Fabric Manager | Exact package-version lockstep |
| Host NVIDIA driver to DLC CUDA runtime | Compatible; driver satisfies CUDA's minimum |
| Host EFA module to DLC libfabric provider | Compatible kernel/provider ABI |
| DLC NCCL to aws-ofi-nccl | Compatible NCCL network-plugin ABI |
| Distributed ranks | Exact same DLC digest on every rank |

## 4. Prove, then pin

Require CUDA initialization, EFA provider discovery, correct local and remote
collectives, and logs showing Libfabric, EFA, RDMA, and GDRDMA without socket
fallback. Record the AMI release/ID and DLC digest. Re-run the preflight when
either artifact changes.

The proven P5 pairing in this repository uses an **AL2023 host** and an
**Ubuntu 22.04 DLC**. It passed CUDA, NVSwitch, NCCL, libfabric, EFA, RDMA, and
GDRDMA validation.

> Decision rule: choose the AMI from the node's hardware and EKS version;
> choose the DLC from the workload, framework, CUDA, platform, and available
> image tags; prove the pair end to end; then pin the AMI release and DLC
> digest.
