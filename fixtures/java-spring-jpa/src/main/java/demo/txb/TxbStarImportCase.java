package demo.txb;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** oracle: txb-star-import — UNKNOWN. @Transactional resolved only via wildcard import. */
@Service
public class TxbStarImportCase {

    @Transactional
    public void run() {
    }
}
