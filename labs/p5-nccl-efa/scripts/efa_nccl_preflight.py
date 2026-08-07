"""Fail-closed NCCL collective preflight for multi-node EFA training."""

from __future__ import annotations

import os
import socket
from datetime import timedelta

import torch
import torch.distributed as dist


def main() -> None:
    local_rank = int(os.environ["LOCAL_RANK"])
    torch.cuda.set_device(local_rank)
    dist.init_process_group(
        backend="nccl",
        timeout=timedelta(seconds=int(os.environ.get("EFA_PREFLIGHT_TIMEOUT_SECONDS", "180"))),
    )

    rank = dist.get_rank()
    world_size = dist.get_world_size()
    device = torch.device("cuda", local_rank)

    # A large collective guarantees that ranks on different nodes exercise the
    # selected NCCL network transport rather than only local CUDA paths.
    payload = torch.full(
        (16 * 1024 * 1024,),
        float(rank + 1),
        dtype=torch.float32,
        device=device,
    )
    for _ in range(3):
        dist.all_reduce(payload, op=dist.ReduceOp.SUM)
        expected = world_size * (world_size + 1) / 2
        if not torch.allclose(
            payload[0],
            torch.tensor(expected, dtype=payload.dtype, device=device),
        ):
            raise RuntimeError(
                f"NCCL all-reduce mismatch on rank {rank}: "
                f"actual={payload[0].item()} expected={expected}"
            )
        payload.fill_(rank + 1)

    dist.barrier()
    print(
        "EFA_NCCL_PREFLIGHT_COLLECTIVE_OK "
        f"host={socket.gethostname()} rank={rank} local_rank={local_rank} "
        f"world_size={world_size}",
        flush=True,
    )
    dist.destroy_process_group()


if __name__ == "__main__":
    main()
