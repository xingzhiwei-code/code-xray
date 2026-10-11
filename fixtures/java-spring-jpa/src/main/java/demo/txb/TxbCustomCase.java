package demo.txb;

import demo.support.Transactional;
import org.springframework.stereotype.Service;

/** oracle: txb-custom — NEGATIVE. Same-named but non-Spring @Transactional. */
@Service
public class TxbCustomCase {

    @Transactional
    public void run() {
    }
}
